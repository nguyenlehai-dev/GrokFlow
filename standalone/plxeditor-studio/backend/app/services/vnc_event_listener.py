"""Docker event listener that auto-syncs the nginx VNC map.

The defence-in-depth chain for /vnc/<short>/* routing:

  Layer 1 — start-vnc-session router waits until map has new short_id
            before returning (covers fresh spawn from user action).
  Layer 2 — idle_cleanup runs a 15s map-refresh loop (covers IP drift
            from passive recreate / deploy).
  Layer 3 — app startup calls refresh_vnc_map once (covers a backend
            restart that missed events while down).
  Layer 4 — THIS module: subscribes to the docker daemon's event
            stream and reacts INSTANTLY (within ~100ms) to any
            container start / die / restart on the grokflow-vnc-*
            prefix. Closes the ≤15s drift window left by layer 2 when
            docker's `restart: unless-stopped` policy spins a VNC
            container back up with a fresh IP.

Best-effort: if the docker daemon socket is unavailable we log a
warning and exit cleanly. The other three layers still cover the
common cases; this one is the cherry on top.
"""

from __future__ import annotations

import asyncio
import os
import time


async def listen_forever() -> None:
    """Subscribe to docker events for grokflow-vnc-* containers + refresh
    the nginx map on every relevant transition. Runs for the lifetime of
    the backend process. Auto-reconnects on socket errors."""
    # Lazy imports so non-docker test envs can still import this module.
    try:
        import docker
    except ImportError:
        print("[vnc-events] docker SDK not installed — listener disabled", flush=True)
        return

    from app.services.nginx_sync import (
        refresh_vnc_map, refresh_vnc_map_until_present, _VNC_NETWORK,
    )

    # Tunable cooldown: when several events arrive in a burst (one start
    # often triggers a network attach event right after), debounce so we
    # don't hammer the map file. 0.3s gives us ~3 refreshes/sec max.
    debounce_sec = float(os.environ.get("VNC_EVENT_DEBOUNCE_SEC", "0.3"))

    print(f"[vnc-events] subscribed (network={_VNC_NETWORK}, debounce={debounce_sec}s)", flush=True)

    while True:
        try:
            client = docker.from_env()
            # Pull events synchronously in a thread — docker SDK doesn't
            # have a native asyncio API. Each `for` iteration yields one
            # event dict.
            last_refresh = 0.0
            queue: asyncio.Queue[dict] = asyncio.Queue()

            def producer() -> None:
                try:
                    for ev in client.events(
                        decode=True,
                        filters={"type": "container", "event": ["start", "die", "destroy"]},
                    ):
                        name = (ev.get("Actor", {}).get("Attributes", {}) or {}).get("name", "")
                        if name.startswith("grokflow-vnc-"):
                            # Put on the queue; main loop drains it. Async-safe
                            # via call_soon_threadsafe on the loop's bound queue.
                            asyncio.run_coroutine_threadsafe(queue.put(ev), loop)
                except Exception as exc:  # noqa: BLE001
                    asyncio.run_coroutine_threadsafe(
                        queue.put({"_error": str(exc)}), loop,
                    )

            loop = asyncio.get_running_loop()
            task = loop.run_in_executor(None, producer)

            while True:
                ev = await queue.get()
                if "_error" in ev:
                    print(f"[vnc-events] producer error: {ev['_error']}, reconnecting", flush=True)
                    break
                name = ev.get("Actor", {}).get("Attributes", {}).get("name", "")
                action = ev.get("Action") or ev.get("status")
                print(f"[vnc-events] {action} {name} — refreshing map", flush=True)
                # Debounce.
                now = time.monotonic()
                if now - last_refresh < debounce_sec:
                    continue
                last_refresh = now
                # For start events: container often shows up in `docker
                # ps` before its IP is set in NetworkSettings (~50-300ms
                # gap). Calling refresh_vnc_map() at that exact moment
                # writes a map MISSING the new entry — then we'd need
                # the 15s loop to catch up. Use the until_present
                # variant so we busy-poll until the new short_id has an
                # IP (max 10s) before writing. For die/destroy we just
                # want to drop the entry → regular refresh is fine.
                short = name.removeprefix("grokflow-vnc-") if name else ""
                try:
                    if action == "start" and short:
                        await asyncio.to_thread(
                            refresh_vnc_map_until_present, short,
                            timeout_sec=10.0,
                        )
                    else:
                        await asyncio.to_thread(refresh_vnc_map)
                except Exception as exc:  # noqa: BLE001
                    print(f"[vnc-events] refresh failed: {exc}", flush=True)
            task.cancel()
        except Exception as exc:  # noqa: BLE001
            print(f"[vnc-events] loop error: {exc}, retrying in 5s", flush=True)
        await asyncio.sleep(5)
