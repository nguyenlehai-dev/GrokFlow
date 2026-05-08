"""Sentry initialization. No-op if SENTRY_DSN env not set."""

import os


def init_sentry() -> None:
    dsn = os.environ.get("SENTRY_DSN", "").strip()
    if not dsn:
        return
    try:
        import sentry_sdk
        from sentry_sdk.integrations.fastapi import FastApiIntegration
        from sentry_sdk.integrations.sqlalchemy import SqlalchemyIntegration
    except ImportError:
        return
    sentry_sdk.init(
        dsn=dsn,
        environment=os.environ.get("APP_ENV", "production"),
        traces_sample_rate=float(os.environ.get("SENTRY_TRACES_SAMPLE_RATE", "0.1")),
        integrations=[FastApiIntegration(), SqlalchemyIntegration()],
        send_default_pii=False,
    )
