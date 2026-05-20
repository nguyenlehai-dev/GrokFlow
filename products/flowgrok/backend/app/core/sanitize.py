"""Best-effort scrubbing of strings before they're stored in the DB or
returned in error responses.

Used by worker code when writing `profile.error_message` /
`job.error_message`: an unsanitized exception traceback can include
API keys, JWTs, DB URLs with passwords, or HTTP Basic-Auth headers
that the caller never meant to expose.

Trade-off: regex-based scrubbing is imperfect (it'll miss novel secret
shapes) but cheap and additive. Anything still leaking through is
caught by Sentry / log review, not relied on as the only defence —
production secrets belong in env vars, not in error strings to begin
with.
"""
from __future__ import annotations

import re

# Hard cap on stored error text — long tracebacks blow up the DB column
# and rarely add value over the first few hundred chars.
MAX_LEN = 1000

# Patterns ordered by specificity — most specific replacements first so
# they don't get swallowed by the general "long token" pattern below.
_SCRUB_PATTERNS = [
    # https://user:pass@host  → https://***:***@host
    (re.compile(r"(https?://)[^:@/\s]+:[^@/\s]+@"), r"\1***:***@"),
    # postgres://user:pass@host
    (re.compile(r"(postgres(?:ql)?(?:\+\w+)?://)[^:@/\s]+:[^@/\s]+@"), r"\1***:***@"),
    # AWS Access Key IDs (AKIA…) — 20 chars upper+digits
    (re.compile(r"\bAKIA[0-9A-Z]{16}\b"), "AKIA****REDACTED"),
    # Bearer tokens in headers
    (re.compile(r"(Bearer\s+)[A-Za-z0-9._\-+/=]{20,}", re.IGNORECASE), r"\1***REDACTED***"),
    # Authorization: Basic xxx
    (re.compile(r"(Authorization:\s*Basic\s+)[A-Za-z0-9+/=]{8,}", re.IGNORECASE),
     r"\1***REDACTED***"),
    # JWT-shaped strings: three base64url segments separated by dots, each
    # >10 chars. Catches access_tokens and refresh tokens.
    (re.compile(r"\beyJ[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{10,}\b"),
     "***JWT-REDACTED***"),
    # Long opaque tokens (40+ chars of base64-ish) — last resort, catches
    # most API keys (Anthropic sk-ant-, OpenAI sk-, Google AIza…). Tighter
    # than the catch-all "any 32+ chars" because we want to keep real text.
    (re.compile(r"\b(sk-[A-Za-z0-9_\-]{20,}|AIza[A-Za-z0-9_\-]{20,}|gwk_[a-z]+_[A-Za-z0-9]{20,})\b"),
     "***API-KEY-REDACTED***"),
]


def scrub_secrets(text: str | None) -> str | None:
    """Run every scrub pattern on `text` and truncate to MAX_LEN.

    Returns None if input is None (so callers can chain it without
    null-check). Never raises.
    """
    if not text:
        return text
    cleaned = text
    for pattern, replacement in _SCRUB_PATTERNS:
        cleaned = pattern.sub(replacement, cleaned)
    if len(cleaned) > MAX_LEN:
        cleaned = cleaned[: MAX_LEN - 20] + "…[truncated]"
    return cleaned
