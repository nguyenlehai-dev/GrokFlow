"""Pure-HTTP / WebSocket video generation client — SCAFFOLD.

Status: NOT FUNCTIONAL. This module wires up the surface area so the
Provider can call into it, but the actual WS protocol implementation
requires real frame captures from a logged-in Grok session driving
video generation. The Playwright fallback remains the default until
this is populated.

How to populate:
  1. Open grok.com in Chrome with DevTools, switch to Video mode
  2. Submit a video prompt
  3. In the Network tab, find the WSS connection to grok.com (or
     similar). Capture all frames sent + received.
  4. Identify message types:
       - subscribe / init handshake (often the first client message)
       - generate request (carries the prompt + params)
       - progress / status events (server → client)
       - asset URL on completion
  5. Fill in the `_send_*` builders and the `_handle_*` parsers below.

The contract this module must implement to slot into GrokProvider:

    client = await GrokVideoWSClient.connect(cookies, statsig_id)
    job = await client.generate(
        prompt="...", duration=6, resolution="720p", ref_image_bytes=None,
    )
    # → {"status": "success", "video_url": "...", "duration_ms": int}
    await client.close()

When fully implemented, set GROK_VIDEO_WS=1 in the env to enable; the
provider's _run_video_via_api branch will pick this up.
"""
from __future__ import annotations

import logging
import os
from dataclasses import dataclass
from typing import Any

log = logging.getLogger(__name__)


@dataclass
class VideoGenResult:
    status: str  # "success" | "failed"
    video_url: str | None = None
    duration_ms: int | None = None
    error_message: str | None = None
    raw_event: dict[str, Any] | None = None


class GrokVideoWSClient:
    """Pure-HTTP/WS client for Grok video generation.

    SCAFFOLD — the connect / generate / close methods raise NotImplementedError
    until the WS protocol is captured. The provider should fall back to the
    Playwright path when this happens.
    """

    def __init__(self, cookies: dict[str, str], x_statsig_id: str | None):
        self.cookies = cookies
        self.x_statsig_id = x_statsig_id
        self._ws = None
        self._closed = True

    @classmethod
    async def connect(
        cls,
        cookies: dict[str, str],
        x_statsig_id: str | None,
    ) -> "GrokVideoWSClient":
        # TODO: open websockets.connect(WS_URL, extra_headers={cookie, statsig})
        # and complete the subscribe handshake.
        raise NotImplementedError(
            "GrokVideoWSClient.connect not implemented — needs captured WS frames. "
            "See module docstring for how to populate."
        )

    async def generate(
        self,
        prompt: str,
        duration: int = 6,
        resolution: str = "720p",
        ref_image_bytes: bytes | None = None,
    ) -> VideoGenResult:
        # TODO: send the generate frame, then read progress events until
        # a terminal event arrives.
        raise NotImplementedError("GrokVideoWSClient.generate not implemented")

    async def close(self) -> None:
        if self._ws and not self._closed:
            # TODO: await self._ws.close()
            self._closed = True


def is_enabled() -> bool:
    """Provider checks this to decide whether to attempt the WS path
    before falling back to Playwright. Default OFF until the protocol
    is captured + verified."""
    return os.environ.get("GROK_VIDEO_WS", "0") == "1"
