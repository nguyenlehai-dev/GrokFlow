"""Per-profile persistent VNC container with CDP-exposed Chromium.

When admin clicks Auto-login on a profile, we spawn a `grokflow/chrome-vnc`
container (custom image) named after the profile. It runs:
  - Xvfb (virtual display)
  - x11vnc + websockify + noVNC (admin views via iframe)
  - Chromium with --remote-debugging-port=9223 (worker attaches via CDP)

The container STAYS RUNNING after admin closes the modal, because:
  - The Chromium process holds the cf_clearance + Grok session that bypassed
    Cloudflare's bot challenge during real user login.
  - The worker connects to that running Chromium via CDP to drive jobs.
  - Spawning a fresh headless Chromium per job re-triggers the challenge → 403.

Lifecycle:
  start_for_profile() → run if not exists, else just return URL (idempotent)
  stop_for_profile()  → admin "Stop browser" — destroys container, profile
                         goes to need_login (next job needs re-login)
"""

import os
import time
from typing import Any

import docker
from docker.errors import APIError, NotFound

VNC_IMAGE = os.environ.get("VNC_IMAGE", "grokflow/chrome-vnc:latest")
NETWORK_NAME = os.environ.get("VNC_NETWORK", "grokflow_default")


def _client() -> docker.DockerClient:
    return docker.from_env()


def _container_name(profile_id: str) -> str:
    short = str(profile_id).replace("-", "")[:12]
    return f"grokflow-vnc-{short}"


def _container_to_host_path(profile_path: str) -> str:
    in_container = os.environ.get("PROFILE_BASE_PATH", "/app/browser_profiles")
    on_host = os.environ.get("PROFILE_BASE_PATH_HOST", in_container)
    if profile_path.startswith(in_container):
        return profile_path.replace(in_container, on_host, 1)
    return profile_path


def _fix_profile_perms(host_profile_path: str, puid: int = 1000, pgid: int = 1000) -> None:
    cli = _client()
    try:
        cli.containers.run(
            "alpine:latest",
            command=["sh", "-c", f"chown -R {puid}:{pgid} /target && chmod -R u+rwX /target"],
            volumes={host_profile_path: {"bind": "/target", "mode": "rw"}},
            remove=True,
            detach=False,
        )
    except Exception as exc:  # noqa: BLE001
        print(f"[vnc] perm fix failed: {exc}", flush=True)


def get_for_profile(profile_id: str) -> dict[str, Any] | None:
    cli = _client()
    name = _container_name(profile_id)
    try:
        c = cli.containers.get(name)
        c.reload()
        return {
            "container_name": name,
            "running": c.status == "running",
            "started_at": c.attrs.get("State", {}).get("StartedAt"),
            "cdp_endpoint": f"http://{name}:9223",
        }
    except NotFound:
        return None


def stop_for_profile(profile_id: str) -> None:
    cli = _client()
    name = _container_name(profile_id)
    try:
        c = cli.containers.get(name)
        c.stop(timeout=5)
        c.remove(force=True)
    except NotFound:
        pass
    except APIError as exc:
        print(f"[vnc] stop error for {name}: {exc}", flush=True)


def start_for_profile(profile_id: str, profile_path: str, provider_url: str) -> dict[str, Any]:
    """Spawn (or reuse) a persistent VNC+CDP container for this profile."""
    cli = _client()
    name = _container_name(profile_id)

    try:
        c = cli.containers.get(name)
        c.reload()
        if c.status == "running":
            return {
                "container_name": name,
                "container_id": c.id,
                "ws_path": "/vnc/",
                "cdp_endpoint": f"http://{name}:9223",
                "reused": True,
                "ready": True,
            }
        # Not running → remove. force=True handles "created" / "exited" /
        # "dead" / "removing" alike; ignore errors so we proceed to create.
        try:
            c.remove(force=True)
        except (APIError, NotFound) as exc:
            print(f"[vnc] pre-cleanup remove failed for {name}: {exc}", flush=True)
    except NotFound:
        pass
    except APIError as exc:
        # get() can race with a slow remove or hit transient daemon errors.
        # Log + fall through; the conflict-on-create retry below will cover
        # the rare case where a same-named container materializes anyway.
        print(f"[vnc] get() error for {name}, will try to create anyway: {exc}", flush=True)

    host_profile_path = _container_to_host_path(profile_path)
    _fix_profile_perms(host_profile_path)

    # Resource caps: each Chromium tab on grok.com costs ~600MB once the
    # heavy React app + media decoders are loaded. With 4 concurrent slots
    # we need ~2.4GB for tabs + ~800MB for the rest of Chromium → 4GB cap.
    # Override via env if you scale slots beyond 4 or up to multiple profiles.
    mem_limit = os.environ.get("VNC_MEM_LIMIT", "4g")
    cpu_quota = int(os.environ.get("VNC_CPU_QUOTA", "200000"))  # 2.0 CPU
    run_kwargs = dict(
        image=VNC_IMAGE,
        name=name,
        environment={
            "STARTUP_URL": provider_url,
            "TZ": "Asia/Ho_Chi_Minh",
        },
        volumes={
            host_profile_path: {"bind": "/config", "mode": "rw"},
        },
        network=NETWORK_NAME,
        shm_size="2g",
        mem_limit=mem_limit,
        memswap_limit=mem_limit,  # disallow swap → predictable behavior
        cpu_period=100000,
        cpu_quota=cpu_quota,
        detach=True,
        restart_policy={"Name": "unless-stopped"},
        labels={"grokflow.profile_id": str(profile_id)},
        security_opt=["seccomp=unconfined"],
    )

    # If a same-named container is wedged (created/exited/removing) the
    # pre-cleanup above sometimes misses it. Treat 409 as "stale leftover,
    # force-remove by name, retry once". After retry we re-raise so the
    # caller gets a real error instead of silently spinning.
    try:
        container = cli.containers.run(**run_kwargs)
    except APIError as exc:
        if exc.response is None or exc.response.status_code != 409:
            raise
        print(f"[vnc] 409 conflict on create '{name}' — force-removing leftover and retrying", flush=True)
        try:
            stale = cli.containers.get(name)
            stale.remove(force=True)
        except NotFound:
            pass
        except APIError as inner:
            print(f"[vnc] could not remove leftover {name}: {inner}", flush=True)
        container = cli.containers.run(**run_kwargs)

    deadline = time.monotonic() + 60
    novnc_ready = cdp_ready = False
    while time.monotonic() < deadline:
        try:
            container.reload()
            if container.status not in ("running", "created"):
                break
            if not novnc_ready:
                exit_code, _ = container.exec_run(
                    ["sh", "-c", "curl -fsS --max-time 2 http://localhost:6901/ >/dev/null 2>&1"],
                )
                if exit_code == 0:
                    novnc_ready = True
            if not cdp_ready:
                exit_code, _ = container.exec_run(
                    ["sh", "-c", "curl -fsS --max-time 2 http://localhost:9223/json/version >/dev/null 2>&1"],
                )
                if exit_code == 0:
                    cdp_ready = True
            if novnc_ready and cdp_ready:
                break
        except APIError:
            pass
        time.sleep(1)

    return {
        "container_name": name,
        "container_id": container.id,
        "ws_path": "/vnc/",
        "cdp_endpoint": f"http://{name}:9223",
        "reused": False,
        "ready": novnc_ready and cdp_ready,
        "novnc_ready": novnc_ready,
        "cdp_ready": cdp_ready,
    }


def stop() -> None:
    """Stop ALL grokflow-vnc-* containers (admin reset)."""
    cli = _client()
    for c in cli.containers.list(all=True, filters={"name": "grokflow-vnc-"}):
        try:
            c.stop(timeout=5)
            c.remove(force=True)
        except APIError:
            pass


def reap_orphans(known_profile_ids: set[str]) -> list[str]:
    """Stop/remove any grokflow-vnc-* container whose profile no longer exists.

    Returns the list of orphan container names that were reaped.
    """
    cli = _client()
    reaped: list[str] = []
    for c in cli.containers.list(all=True, filters={"name": "grokflow-vnc-"}):
        label_pid = (c.labels or {}).get("grokflow.profile_id")
        if label_pid and label_pid in known_profile_ids:
            continue
        # No profile_id label or profile_id not in DB → orphan.
        try:
            c.stop(timeout=3)
        except APIError:
            pass
        try:
            c.remove(force=True)
            reaped.append(c.name)
        except APIError:
            pass
    return reaped


def get_status() -> dict[str, Any]:
    cli = _client()
    running = []
    for c in cli.containers.list(filters={"name": "grokflow-vnc-"}):
        c.reload()
        running.append({
            "name": c.name,
            "profile_id": c.labels.get("grokflow.profile_id"),
            "started_at": c.attrs.get("State", {}).get("StartedAt"),
        })
    return {"running_count": len(running), "containers": running}
