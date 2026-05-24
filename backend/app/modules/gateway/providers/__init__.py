"""Vendor providers — concrete implementations live in submodules.

Each provider exposes `async def execute(model, payload, api_key) -> dict`
and raises `ProviderQuotaExhausted` on 429-equivalent responses so the
router can try the next pool key.
"""
from __future__ import annotations

from typing import Any, Protocol


class ProviderError(Exception):
    """Generic provider failure that should bubble back to the client as a 500."""


class ProviderQuotaExhausted(ProviderError):
    """The picked API key is over quota / rate-limited. Router should try next."""


class ProviderAuthError(ProviderError):
    """The picked API key was rejected (revoked, invalid)."""


class VendorProvider(Protocol):
    """Async interface every vendor implementation satisfies."""

    async def execute(
        self,
        *,
        model: str,
        prompt: str | None,
        reference_image_urls: list[str],
        reference_video_urls: list[str],
        aspect_ratio: str | None,
        image_size: str | None,
        extra: dict[str, Any] | None,
        api_key: str,
        project_id: str | None,
    ) -> dict[str, Any]:
        ...


def get_provider(vendor_code: str) -> "VendorProvider | None":
    """Lookup a provider by vendor code. Returns None for unknown vendors."""
    if vendor_code in ("google", "gemini"):
        from .gemini import GeminiProvider
        return GeminiProvider()
    if vendor_code in ("openai", "oai"):
        from .openai_provider import OpenAIProvider
        return OpenAIProvider()
    if vendor_code in ("anthropic", "claude"):
        from .anthropic_provider import AnthropicProvider
        return AnthropicProvider()
    if vendor_code in ("replicate",):
        from .replicate_provider import ReplicateProvider
        return ReplicateProvider()
    if vendor_code in ("grok", "xai"):
        # Grok via a GrokFlow-as-backend pool. Pool keys carry
        # `metadata.url` pointing at a GrokFlow instance + an api_key
        # that authenticates to /api/jobs there.
        from .grok_provider import GrokProvider
        return GrokProvider()
    return None
