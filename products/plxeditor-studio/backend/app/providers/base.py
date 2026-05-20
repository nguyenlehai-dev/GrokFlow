from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any


@dataclass
class InputAttachment:
    name: str
    mime: str
    bytes: bytes


@dataclass
class JobInput:
    prompt: str
    job_type: str  # "image" | "video"
    options: dict[str, Any] | None
    profile_path: str  # absolute path to Chrome user-data-dir
    attachments: list[InputAttachment] = field(default_factory=list)
    # When the job was scoped to a GrokProject (per-tenant workspace inside
    # the Grok account), the worker navigates to grok.com/project/<slug>
    # before submitting the prompt. None → use the default /imagine URL.
    grok_project_id: str | None = None


@dataclass
class ResultFile:
    bytes: bytes
    name: str
    mime: str
    source_url: str | None = None


@dataclass
class JobResult:
    success: bool
    files: list[ResultFile] = field(default_factory=list)
    error_message: str | None = None
    error_code: str | None = None  # see ERROR_CODES below
    retryable: bool = False
    extra: dict[str, Any] = field(default_factory=dict)

    # Backward-compat shortcuts (first file)
    @property
    def file_bytes(self) -> bytes | None:
        return self.files[0].bytes if self.files else None

    @property
    def file_name(self) -> str | None:
        return self.files[0].name if self.files else None

    @property
    def mime_type(self) -> str | None:
        return self.files[0].mime if self.files else None


# Standard error codes the worker uses to decide retry/profile-state-machine.
ERROR_CODES = {
    "cookie_expired",       # → profile.status = need_login, no retry
    "captcha_required",     # → profile.status = need_login, no retry
    "rate_limited",         # → keep logged_in, requeue with delay
    "provider_blocked",     # → profile.status = blocked, no retry
    "browser_crashed",      # → retry once
    "network_error",        # → retry with backoff
    "timeout",              # → retry with backoff
    "unknown_error",        # → retry once
    "unsupported_job_type", # → no retry
}


class Provider(ABC):
    name: str = "base"

    @abstractmethod
    async def run(self, job: JobInput) -> JobResult:
        """Execute the job. MUST NOT raise — convert errors to JobResult."""

    async def check_session(self, profile_path: str) -> bool:
        from app.browser.profile_manager import check_session  # avoid circular import
        ok, _ = await check_session(profile_path, self.name)
        return ok
