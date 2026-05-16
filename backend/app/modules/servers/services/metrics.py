"""Parse system metrics out of standard Linux commands.

We deliberately stick to commands every distro ships — `uname`, `cat
/proc/...`, `free`, `df`, `nproc`, `lsb_release` — instead of requiring
glances / collectd / node_exporter. Trade-off: parsing is brittle.
Mitigation: every field is optional in `ServerMetrics`; if parsing
fails the UI just hides that row.
"""

from __future__ import annotations

import logging
import re

from app.models import Server
from app.modules.servers.schemas import ServerMetrics
from .ssh import SshConnectError, run_command

log = logging.getLogger(__name__)


# One big composite command — saves N round trips when the host is on a
# slow link. Sections are delimited by `=== <name> ===` so we can split
# the output deterministically.
_PROBE_SCRIPT = r"""
echo '=== OS ===' && (lsb_release -ds 2>/dev/null || cat /etc/os-release 2>/dev/null | head -1)
echo '=== KERNEL ===' && uname -r
echo '=== UPTIME ===' && uptime -p 2>/dev/null || uptime
echo '=== CORES ===' && nproc
echo '=== LOAD ===' && cat /proc/loadavg
echo '=== MEM ===' && free -b | awk '/^Mem:/{print $2" "$3}'
echo '=== DISK ===' && df -B1 / | awk 'NR==2{print $2" "$3}'
"""


def _section(text: str, name: str) -> str:
    """Extract the chunk between `=== name ===` and the next `===`."""
    m = re.search(rf"=== {re.escape(name)} ===\s*\n(.*?)(?:\n=== |\Z)", text, re.DOTALL)
    return m.group(1).strip() if m else ""


def _safe_float(s: str) -> float | None:
    try:
        return float(s)
    except (TypeError, ValueError):
        return None


def _safe_int(s: str) -> int | None:
    try:
        return int(s)
    except (TypeError, ValueError):
        return None


def probe(server: Server) -> ServerMetrics:
    """Open an SSH session, run the probe, parse into a ServerMetrics.

    Raises `SshConnectError` if the host is unreachable — caller is
    expected to translate to a 502 / mark the row as `unreachable`.
    """
    res = run_command(server, _PROBE_SCRIPT, timeout=15.0)
    if not res.ok:
        log.warning("probe rc=%s stderr=%s", res.rc, res.stderr[:200])
        # Even with rc!=0 we usually get partial sections — try to parse anyway.

    out = res.stdout

    os_line = _section(out, "OS") or None
    kernel = _section(out, "KERNEL") or None
    uptime = _section(out, "UPTIME") or None
    cores = _safe_int(_section(out, "CORES"))

    # /proc/loadavg: "0.14 0.10 0.09 1/287 12345"
    load = _section(out, "LOAD").split()
    load_1m = _safe_float(load[0]) if load else None
    cpu_pct = None
    if load_1m is not None and cores:
        cpu_pct = round(min(load_1m / cores * 100, 100.0), 1)

    # MEM: "<total_bytes> <used_bytes>"
    mem_parts = _section(out, "MEM").split()
    mem_total_gb = None
    mem_used_gb = None
    if len(mem_parts) == 2:
        t = _safe_int(mem_parts[0])
        u = _safe_int(mem_parts[1])
        if t is not None:
            mem_total_gb = round(t / 1024**3, 2)
        if u is not None:
            mem_used_gb = round(u / 1024**3, 2)

    # DISK: "<total_bytes> <used_bytes>"
    disk_parts = _section(out, "DISK").split()
    disk_total_gb = None
    disk_used_gb = None
    if len(disk_parts) == 2:
        t = _safe_int(disk_parts[0])
        u = _safe_int(disk_parts[1])
        if t is not None:
            disk_total_gb = round(t / 1024**3, 1)
        if u is not None:
            disk_used_gb = round(u / 1024**3, 1)

    return ServerMetrics(
        os=os_line,
        kernel=kernel,
        uptime=uptime,
        cpu_cores=cores,
        cpu_usage_pct=cpu_pct,
        memory_total_gb=mem_total_gb,
        memory_used_gb=mem_used_gb,
        disk_total_gb=disk_total_gb,
        disk_used_gb=disk_used_gb,
        # boot_order / network metrics aren't probed yet — left None so the
        # FE meter falls back gracefully.
        boot_order="scsi0",
    )


__all__ = ["probe", "SshConnectError"]
