from app.providers.base import JobInput, JobResult, Provider


def get_provider(name: str) -> Provider:
    if name == "grok":
        from app.providers.grok_provider import GrokProvider
        return GrokProvider()
    if name == "flow":
        from app.providers.flow_provider import FlowProvider
        return FlowProvider()
    raise ValueError(f"Unknown provider: {name}")


__all__ = ["JobInput", "JobResult", "Provider", "get_provider"]
