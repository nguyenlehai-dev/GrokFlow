"""Seed fake jobs / flow_jobs / gw_requests under a target domain so the
admin dashboard's per-domain + per-app aggregates can be visually verified.

Why a seed instead of real API calls?
  Real /api/jobs would route through worker → Chromium → Grok itself,
  burning quota + minutes per job. We only need rows in the right
  shape with realistic distributions to prove the dashboard pipeline
  works end-to-end.

Rows are tagged so cleanup is unambiguous:
  - Job.prompt prefix:    [SEED:<hostname>]
  - FlowJob.error_message null + a sentinel in input_files object_key
  - GwRequest.gw_id prefix: seed_<hostname>_

Run via the helper at the bottom which SFTPs this script into the
backend container and executes it. Take --cleanup to delete the seeded
rows for the given hostname.

Usage from your laptop:
  python scripts/seed-domain-jobs.py --hostname video.plxeditor.com
  python scripts/seed-domain-jobs.py --hostname video.plxeditor.com --cleanup
"""
from __future__ import annotations

import argparse
import os
import sys
import textwrap

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

import paramiko  # type: ignore

HOST = os.getenv("VPS_HOST", "192.168.1.16")
VPS_USER = os.getenv("VPS_USER", "vpsroot")
PASSWORD = os.getenv("VPS_PASSWORD", "123456789")


SEED_BODY = r'''
import asyncio
import json
import os
import random
import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import delete, select
from app.core.database import SessionLocal
from app.models import (
    Domain, FlowJob, GwRequest, GwVendor, Job, User,
)
from app.core.security import hash_password

HOSTNAME = os.environ["SEED_HOSTNAME"]
MODE = os.environ.get("SEED_MODE", "create")  # create | cleanup
TAG = f"[SEED:{HOSTNAME}]"

GROK_IMAGE_MODELS = ["grok-imagine", "grok-imagine-pro", "grok-imagine-fast"]
GROK_VIDEO_MODELS = ["grok-imagine-video", "grok-imagine-video-pro"]
FLOW_OPS = ["cut", "merge", "extract-audio", "speed", "resize", "crop", "extract-frames", "add-audio"]
GW_VENDORS_HINT = ["openai", "anthropic", "gemini", "replicate"]


async def cleanup(db):
    """Delete every row tagged for this hostname. Idempotent."""
    # Jobs: match by prompt prefix
    res = await db.execute(delete(Job).where(Job.prompt.like(f"{TAG}%")))
    n_jobs = res.rowcount or 0
    # FlowJobs: match by error_message marker
    res = await db.execute(delete(FlowJob).where(FlowJob.error_message == f"SEED:{HOSTNAME}"))
    n_flow = res.rowcount or 0
    # GwRequests: match by gw_id prefix
    res = await db.execute(delete(GwRequest).where(GwRequest.gw_id.like(f"seed_{HOSTNAME}_%")))
    n_gw = res.rowcount or 0
    await db.commit()
    print(f"cleanup: removed {n_jobs} jobs, {n_flow} flow_jobs, {n_gw} gw_requests")


async def ensure_domain(db) -> Domain:
    d = (await db.execute(select(Domain).where(Domain.hostname == HOSTNAME))).scalar_one_or_none()
    if d:
        print(f"domain exists: {d.id} ({d.hostname})")
        return d
    d = Domain(
        hostname=HOSTNAME,
        label=HOSTNAME.split(".")[0].title(),
        description=f"Seeded domain for dashboard verification ({HOSTNAME})",
        status="active",
        allow_all_pages=False,
        allowed_pages=["/dashboard", "/grok/jobs", "/flow/cut", "/audit-logs"],
    )
    db.add(d)
    await db.flush()
    print(f"created domain: {d.id} ({d.hostname})")
    return d


async def ensure_test_user(db, domain: Domain) -> User:
    email = f"seed-test@{HOSTNAME}"
    u = (await db.execute(select(User).where(User.email == email))).scalar_one_or_none()
    if u:
        print(f"test user exists: {u.id}")
        return u
    u = User(
        email=email,
        password_hash=hash_password("seed-not-used"),
        full_name="Seed Test User",
        role="user",
        domain_id=domain.id,
        status="active",
    )
    db.add(u)
    await db.flush()
    print(f"created test user: {u.id}")
    return u


async def seed_grok_jobs(db, user: User, n_image: int, n_video: int):
    now = datetime.now(timezone.utc)
    statuses = ["success"] * 7 + ["failed"] * 2 + ["queued"]
    created = {"image": 0, "video": 0}

    for i in range(n_image):
        j = Job(
            user_id=user.id,
            provider="grok",
            job_type="image",
            prompt=f"{TAG} test image #{i+1} — colorful landscape",
            input_payload={
                "model": random.choice(GROK_IMAGE_MODELS),
                "aspect": random.choice(["1:1", "16:9", "9:16"]),
                "n": 1,
            },
            status=random.choice(statuses),
            created_at=now - timedelta(hours=random.randint(0, 48), minutes=random.randint(0, 59)),
        )
        if j.status == "success":
            j.result_url = f"/api/files/{uuid.uuid4()}/download"
            j.completed_at = j.created_at + timedelta(seconds=random.randint(30, 90))
        db.add(j)
        created["image"] += 1

    for i in range(n_video):
        j = Job(
            user_id=user.id,
            provider="grok",
            job_type="video",
            prompt=f"{TAG} test video #{i+1} — animated scene",
            input_payload={
                "model": random.choice(GROK_VIDEO_MODELS),
                "resolution": random.choice(["480p", "720p"]),
                "duration": random.choice([6, 10]),
            },
            status=random.choice(statuses),
            created_at=now - timedelta(hours=random.randint(0, 72), minutes=random.randint(0, 59)),
        )
        if j.status == "success":
            j.result_url = f"/api/files/{uuid.uuid4()}/download"
            j.completed_at = j.created_at + timedelta(seconds=random.randint(90, 300))
        db.add(j)
        created["video"] += 1
    print(f"seeded {created['image']} grok image + {created['video']} grok video jobs")


async def seed_flow_jobs(db, user: User, n: int):
    now = datetime.now(timezone.utc)
    statuses = ["completed"] * 7 + ["failed"] * 2 + ["queued"]
    for i in range(n):
        op = random.choice(FLOW_OPS)
        fj = FlowJob(
            user_id=user.id,
            operation=op,
            status=random.choice(statuses),
            progress=100 if random.random() > 0.3 else random.randint(0, 90),
            params={"seed": True},
            input_files=[{"filename": f"in_{i}.mp4", "object_key": f"seed/{i}.mp4"}],
            error_message=f"SEED:{HOSTNAME}",
            created_at=now - timedelta(hours=random.randint(0, 36)),
        )
        if fj.status == "completed":
            fj.output_url = f"/flow-output/seed_{uuid.uuid4().hex[:8]}_{op}.mp4"
        db.add(fj)
    print(f"seeded {n} flow_jobs across {len(FLOW_OPS)} operations")


async def seed_gw_requests(db, domain: Domain, n: int):
    # Use existing vendors if any so the dashboard shows real names; fall back
    # to null vendor_id (groups under 'Unknown vendor').
    vendors = (await db.execute(select(GwVendor).limit(8))).scalars().all()
    now = datetime.now(timezone.utc)
    statuses = ["success"] * 8 + ["failed"] * 2
    for i in range(n):
        v = random.choice(vendors) if vendors else None
        r = GwRequest(
            gw_id=f"seed_{HOSTNAME}_{uuid.uuid4().hex[:12]}",
            domain_id=domain.id,
            vendor_id=v.id if v else None,
            function_code="chat",
            model=random.choice(["gpt-4o-mini", "claude-3-5-haiku", "gemini-2.0-flash"]),
            status=random.choice(statuses),
            latency_ms=random.randint(800, 5500),
            tokens_input=random.randint(50, 2000),
            tokens_output=random.randint(20, 1500),
            cost_cents=random.randint(1, 50),
            created_at=now - timedelta(hours=random.randint(0, 48)),
        )
        db.add(r)
    print(f"seeded {n} gw_requests (vendors={'real' if vendors else 'null'})")


async def main():
    async with SessionLocal() as db:
        if MODE == "cleanup":
            await cleanup(db)
            return
        domain = await ensure_domain(db)
        user = await ensure_test_user(db, domain)
        await seed_grok_jobs(db, user, n_image=12, n_video=6)
        await seed_flow_jobs(db, user, n=10)
        await seed_gw_requests(db, domain, n=8)
        await db.commit()
        print("--- summary ---")
        print(f"  domain:  {domain.hostname} ({domain.id})")
        print(f"  user:    {user.email} ({user.id})")
        print(f"  total seeded: 18 grok jobs + 10 flow_jobs + 8 gw_requests")
        print(f"  cleanup: python scripts/seed-domain-jobs.py --hostname {HOSTNAME} --cleanup")

asyncio.run(main())
'''


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--hostname", required=True)
    ap.add_argument("--cleanup", action="store_true",
                    help="Remove previously-seeded rows instead of inserting")
    args = ap.parse_args()
    mode = "cleanup" if args.cleanup else "create"

    c = paramiko.SSHClient()
    c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    c.connect(HOST, username=VPS_USER, password=PASSWORD, timeout=20)

    sftp = c.open_sftp()
    with sftp.open("/tmp/seed_jobs.py", "w") as f:
        f.write(SEED_BODY)
    sftp.close()

    cmd = (
        f"echo {PASSWORD} | sudo -S bash -c '"
        f"docker cp /tmp/seed_jobs.py grokflow-backend-1:/tmp/seed_jobs.py && "
        f"docker exec -e PYTHONPATH=/app -e SEED_HOSTNAME={args.hostname} -e SEED_MODE={mode} "
        f"-w /app grokflow-backend-1 python /tmp/seed_jobs.py 2>&1'"
    )
    _, out, _ = c.exec_command(cmd, timeout=120)
    out.channel.settimeout(120.0)
    data = b""
    while True:
        chunk = out.channel.recv(65536)
        if not chunk:
            break
        data += chunk
    print(data.decode("utf-8", errors="replace"))
    c.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
