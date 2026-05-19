"""Periodic Chromium-tab GC for VNC containers.

After a Grok job completes, the page navigates from `/imagine` to
`/project/<id>?chat=<chat_id>` (the chat-history view showing the
result). The grok_provider's per-job `finally` block closes the
worker's own tab, but manual VNC sessions — admin Auto-login flow,
manual prompts inside the iframe — leave tabs the worker never
tracked.

Without this loop those tabs persist until the next automated job
triggers the start-of-job GC. Each Chromium tab eats ~150-300 MB
of resident memory, so a profile that hasn't run a job in hours
can balloon to >1 GB of stale-tab RAM.

Strategy: every 5 minutes walk every running `grokflow-vnc-*`
container, query its in-container CDP `/json` endpoint, and close
pages whose URL matches a known post-job shape. Never close the
last page on a container — Chromium needs at least one target or
new-tab creation breaks with `Failed to open a new tab`.

Logs `[tab-gc]` lines on every cycle that actually closes something,
silent otherwise.
"""
from __future__ import annotations

import asyncio
import json as _json
import os


_GC_INTERVAL_SEC = int(os.environ.get("VNC_TAB_GC_INTERVAL_SEC", "300"))

# URL fragments that mark a Grok page as "stale result / chat" — safe
# to close. Conservative on purpose: matching `/project/` alone would
# also close the user's project-home tab they may have opened manually.
_STALE_URL_PATTERNS = (
    "/imagine/post/",   # legacy result URL shape (pre Q2 2026)
    "?chat=",           # current shape: /project/<id>?chat=<chat_id>
    "/chat/",           # direct chat link from share
    "/share/",          # public share view
)


async def tab_gc_loop() -> None:
    """Long-running background task. Spawn from app lifespan."""
    print(
        f"[tab-gc] started, interval={_GC_INTERVAL_SEC}s, "
        f"patterns={_STALE_URL_PATTERNS}",
        flush=True,
    )
    while True:
        try:
            n = await asyncio.to_thread(prune_all_vnc_containers)
            if n:
                print(f"[tab-gc] closed {n} stale tab(s)", flush=True)
        except Exception as exc:  # noqa: BLE001
            print(f"[tab-gc] err: {type(exc).__name__}: {exc}", flush=True)
        await asyncio.sleep(_GC_INTERVAL_SEC)


def prune_all_vnc_containers() -> int:
    """Synchronous helper — uses docker SDK + container.exec_run.

    Called via asyncio.to_thread so blocking I/O doesn't stall the loop.
    Returns total tabs closed across all VNC containers this tick.
    """
    try:
        import docker
        client = docker.from_env()
    except Exception:
        return 0
    total = 0
    for c in client.containers.list(filters={"name": "grokflow-vnc-"}):
        if not c.name.startswith("grokflow-vnc-"):
            continue
        try:
            total += _prune_one_container(c)
        except Exception:  # noqa: BLE001 — never let one bad container kill the loop
            continue
    return total


def _prune_one_container(container) -> int:
    """List CDP targets in the container, close stale ones.

    Uses `wget -qO-` because the kasmweb image doesn't ship curl by
    default. wget is busybox-builtin, always present.
    """
    exec_res = container.exec_run(
        cmd=["sh", "-c", "wget -qO- http://localhost:9222/json 2>/dev/null"],
    )
    if exec_res.exit_code != 0 or not exec_res.output:
        return 0
    try:
        targets = _json.loads(exec_res.output.decode("utf-8", errors="replace"))
    except Exception:  # noqa: BLE001
        return 0
    if not isinstance(targets, list):
        return 0

    pages = [t for t in targets if t.get("type") == "page"]
    if len(pages) <= 1:
        return 0  # never leave Chromium with zero pages

    closed = 0
    for t in pages:
        # Safety floor: always keep at least 1 page alive.
        if len(pages) - closed <= 1:
            break
        url = t.get("url", "") or ""
        if not any(p in url for p in _STALE_URL_PATTERNS):
            continue
        target_id = t.get("id")
        if not target_id:
            continue
        close_res = container.exec_run(
            cmd=[
                "sh", "-c",
                f"wget -qO- http://localhost:9222/json/close/{target_id} 2>/dev/null",
            ],
        )
        # CDP returns "Target is closing" on success.
        if close_res.exit_code == 0:
            closed += 1
    return closed
