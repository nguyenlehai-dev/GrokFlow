"""Per-profile concurrency gate for jobs that actually open a Chromium tab.

Originally `profile.active_jobs / max_concurrent_jobs` was acquired by
the worker before calling the provider — that made sense when every
image job drove Playwright DOM and consumed ~600MB Chromium RAM.

Now the provider's API path handles most image jobs through pure
`httpx` (no tab, ~negligible RAM). Pre-acquiring at worker level
artificially caps API throughput at the DOM slot count.

This module exposes acquire/release helpers the *provider* calls from
inside its DOM entry points (`_run_image`, `_run_image_in_project`).
API path runs unbounded; DOM path is still bounded so opening 50
prompts in parallel can never produce 50 Chromium tabs.

Video is unaffected — it always uses Playwright DOM, so the worker
keeps acquiring `active_video_jobs` up-front (no API path exists).
"""
from __future__ import annotations

import uuid

from sqlalchemy import update

from app.core.database import SessionLocal
from app.models import Profile


async def acquire_image_dom_slot(profile_id: uuid.UUID | str) -> bool:
    """Atomically increment `active_jobs` iff there's a free slot.

    Returns True if the slot was acquired; False if the profile is at
    capacity. Caller must `release_image_dom_slot()` on the same id
    when its DOM run finishes (success or failure).
    """
    if isinstance(profile_id, str):
        profile_id = uuid.UUID(profile_id)
    async with SessionLocal() as db:
        result = await db.execute(
            update(Profile)
            .where(
                Profile.id == profile_id,
                Profile.active_jobs < Profile.max_concurrent_jobs,
            )
            .values(
                active_jobs=Profile.active_jobs + 1,
                status="running_job",
            )
        )
        await db.commit()
        return (result.rowcount or 0) > 0


async def release_image_dom_slot(profile_id: uuid.UUID | str) -> None:
    """Decrement `active_jobs`; if it hits 0, flip status back to logged_in.

    Idempotent w.r.t. negative drift — clamps to 0.
    """
    if isinstance(profile_id, str):
        profile_id = uuid.UUID(profile_id)
    async with SessionLocal() as db:
        prof = await db.get(Profile, profile_id)
        if prof is None:
            return
        prof.active_jobs = max(0, prof.active_jobs - 1)
        if prof.active_jobs == 0 and prof.active_video_jobs == 0:
            # No more concurrent DOM work — clear the running marker so
            # the dashboard reflects "idle".
            if prof.status == "running_job":
                prof.status = "logged_in"
        await db.commit()
