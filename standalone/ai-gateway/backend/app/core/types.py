"""Shared pydantic field types.

PermissiveEmail validates email shape with a basic regex but accepts any TLD
including reserved-use ones (`.local`, `.test`, `.internal`...). Pydantic v2's
`EmailStr` rejects those by default for "deliverability" reasons, which makes
it unusable for internal-only deployments.
"""
from __future__ import annotations

import re
from typing import Annotated

from pydantic import AfterValidator

# Pragmatic email regex — local-part allows letters/digits/._%+-
# Domain part allows multi-label TLDs of any kind.
_EMAIL_RE = re.compile(r"^[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}$")


def _validate_email_permissive(value: str) -> str:
    if not isinstance(value, str):
        raise ValueError("email must be a string")
    v = value.strip().lower()
    if len(v) > 320 or not _EMAIL_RE.match(v):
        raise ValueError("not a valid email address")
    return v


PermissiveEmail = Annotated[str, AfterValidator(_validate_email_permissive)]
