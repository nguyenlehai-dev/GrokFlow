"""Thin wrapper around the FFmpeg/ffprobe CLI.

Subprocess calls only — no domain logic. The service layer owns the
choreography (which inputs, which output dir, when to update DB rows).

Why subprocess rather than a Python ffmpeg binding? Two reasons:
  1) ffmpeg-python / imageio-ffmpeg add a transitive dependency tree
     larger than the actual binary they wrap.
  2) The shell-out is what every other FFmpeg wrapper does under the
     hood anyway — exposing it directly keeps stack traces honest.

Public surface is small on purpose: every tool reduces to one of these
calls. Adding a new tool means assembling the right argv in
`service.py`, not editing this file.
"""
from __future__ import annotations

import logging
import subprocess
from pathlib import Path

logger = logging.getLogger(__name__)

# Hard cap so a stuck encode can't pin a backend worker forever. 600s
# matches the upstream service we replaced. Tools that need more should
# be split into chunks.
FFMPEG_TIMEOUT_S = 600


class FfmpegError(RuntimeError):
    """Raised when the ffmpeg subprocess exits non-zero."""


def run_ffmpeg(args: list[str]) -> None:
    """Execute `ffmpeg <args>`. Raises FfmpegError with stderr on failure."""
    cmd = ["ffmpeg", "-y", *args]
    logger.info("ffmpeg %s", " ".join(args))
    try:
        result = subprocess.run(
            cmd, capture_output=True, text=True, timeout=FFMPEG_TIMEOUT_S,
        )
    except subprocess.TimeoutExpired as exc:
        raise FfmpegError(f"ffmpeg timed out after {FFMPEG_TIMEOUT_S}s") from exc
    if result.returncode != 0:
        # FFmpeg dumps everything to stderr — including normal progress
        # lines — so include both streams in the error for debuggability.
        raise FfmpegError(result.stderr.strip() or result.stdout.strip() or "ffmpeg failed")


def probe_duration(path: Path) -> float:
    """Return media duration in seconds via ffprobe. Returns 0 on failure."""
    try:
        out = subprocess.run(
            [
                "ffprobe", "-v", "error",
                "-show_entries", "format=duration",
                "-of", "default=noprint_wrappers=1:nokey=1",
                str(path),
            ],
            capture_output=True, text=True, timeout=30,
        )
        if out.returncode == 0 and out.stdout.strip():
            return float(out.stdout.strip())
    except (subprocess.SubprocessError, ValueError):
        pass
    return 0.0
