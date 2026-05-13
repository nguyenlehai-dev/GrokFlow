"""Fire a batch of Grok jobs across all logged_in profiles + poll for results.

Phase 1: ensure every logged_in admin-pool profile has its VNC container
         running (calls vnc_manager.start_for_profile for any missing).
Phase 2: fire N image jobs + N video jobs through the normal service path.
         Auto-pick distributes across profiles; round-robin via
         `active_jobs ASC, last_used_at ASC` keeps the load balanced.
Phase 3: poll every job by id until terminal OR deadline. Print summary.

Each phase runs as one docker exec call so the heavy work stays inside
the backend container (no paramiko channel timeouts to worry about for
short bursts).
"""
from __future__ import annotations

import argparse
import os
import sys
import textwrap
import time

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

import paramiko  # type: ignore

HOST = os.getenv("VPS_HOST", "192.168.1.16")
VPS_USER = os.getenv("VPS_USER", "vpsroot")
PASSWORD = os.getenv("VPS_PASSWORD", "123456789")


def parse_args():
    ap = argparse.ArgumentParser()
    ap.add_argument("--email", default="admin@grokflow.io")
    ap.add_argument("--images", type=int, default=5, help="image jobs to fire")
    ap.add_argument("--videos", type=int, default=5, help="video jobs to fire")
    ap.add_argument("--poll-seconds", type=int, default=600,
                    help="how long to keep polling all jobs")
    return ap.parse_args()


def ssh():
    c = paramiko.SSHClient()
    c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    c.connect(HOST, username=VPS_USER, password=PASSWORD, timeout=20)
    return c


def upload(c, path: str, content: str) -> None:
    sftp = c.open_sftp()
    with sftp.open(path, "w") as f:
        f.write(content)
    sftp.close()


def docker_exec_py(c, host_script_path: str, container_script_path: str, extra_env: str = "") -> str:
    """Copy script into backend container + run it. Returns stdout (incl. stderr)."""
    cmd = (
        f"echo {PASSWORD} | sudo -S bash -c '"
        f"docker cp {host_script_path} grokflow-backend-1:{container_script_path} && "
        f"docker exec -e PYTHONPATH=/app -w /app {extra_env} grokflow-backend-1 "
        f"python {container_script_path} 2>&1'"
    )
    _, out, _ = c.exec_command(cmd, timeout=300)
    out.channel.settimeout(300.0)
    data = b""
    while True:
        chunk = out.channel.recv(65536)
        if not chunk:
            break
        data += chunk
    return data.decode("utf-8", errors="replace")


# ─── Phase 1: ensure VNC running for every logged_in admin-pool profile ────
PHASE1_SCRIPT = """\
import asyncio, sys
from app.core.database import SessionLocal
from app.models import Profile, User
from app.browser import vnc_manager
from sqlalchemy import select

async def main():
    async with SessionLocal() as db:
        rows = (await db.execute(
            select(Profile, User).join(User, User.id == Profile.user_id).where(
                User.role.in_(['admin', 'super_admin']),
                Profile.provider == 'grok',
                Profile.status.in_(['logged_in', 'running_job']),
            )
        )).all()
    print(f'found {len(rows)} pool profiles')
    for prof, user in rows:
        info = vnc_manager.get_for_profile(str(prof.id))
        running = bool(info and info.get('running'))
        print(f'  {prof.name} ({prof.id}) running={running}')
        if not running:
            try:
                # `profile_path` is the in-container path; vnc_manager translates
                # to host bind-path internally.
                profile_path = f'/app/browser_profiles/{prof.id}'
                provider_url = 'https://grok.com/'
                info = vnc_manager.start_for_profile(str(prof.id), profile_path, provider_url)
                print(f'    spawned VNC: {info}')
            except Exception as e:
                print(f'    SPAWN FAILED: {e!r}')

asyncio.run(main())
"""


# ─── Phase 2: fire image + video jobs ─────────────────────────────────────
PHASE2_TEMPLATE = """\
import asyncio, json
from app.core.database import SessionLocal
from app.models import User
from app.modules.grok.jobs import service as job_service
from sqlalchemy import select

EMAIL = {email!r}
IMAGE_VARIANTS = [
    {{'aspect': '1:1',  'size': '1024x1024', 'quality': 'speed', 'prompt': 'a misty Vietnamese mountain village at sunrise'}},
    {{'aspect': '16:9', 'size': '1024x576',  'quality': 'speed', 'prompt': 'cyberpunk Saigon street, neon rain'}},
    {{'aspect': '9:16', 'size': '576x1024',  'quality': 'speed', 'prompt': 'phở bowl close-up, steam rising'}},
    {{'aspect': '4:3',  'size': '1024x768',  'quality': 'speed', 'prompt': 'lotus pond at noon, oil painting'}},
    {{'aspect': '3:4',  'size': '768x1024',  'quality': 'speed', 'prompt': 'water buffalo in a rice paddy'}},
]
VIDEO_VARIANTS = [
    {{'aspect': '16:9', 'resolution': '480p', 'duration': 6,  'mode': 'normal', 'prompt': 'a dragon flying over Ha Long Bay'}},
    {{'aspect': '9:16', 'resolution': '480p', 'duration': 6,  'mode': 'normal', 'prompt': 'cat doing parkour in alley'}},
    {{'aspect': '16:9', 'resolution': '720p', 'duration': 6,  'mode': 'fun',    'prompt': 'banh mi exploding with flavor'}},
    {{'aspect': '9:16', 'resolution': '720p', 'duration': 10, 'mode': 'normal', 'prompt': 'time-lapse Hanoi sunset, traffic streaks'}},
    {{'aspect': '16:9', 'resolution': '480p', 'duration': 10, 'mode': 'custom', 'prompt': 'a tiny astronaut walking on a coffee bean'}},
]
N_IMG = {n_img}
N_VID = {n_vid}

async def main():
    async with SessionLocal() as db:
        user = (await db.execute(select(User).where(User.email == EMAIL))).scalar_one_or_none()
        if not user:
            print('USER_NOT_FOUND'); return
        ids = []
        for i in range(N_IMG):
            v = IMAGE_VARIANTS[i % len(IMAGE_VARIANTS)]
            try:
                job = await job_service.create_job(
                    db, user_id=user.id, provider='grok', job_type='image',
                    prompt=v['prompt'], profile_id=None,
                    options={{'aspect': v['aspect'], 'size': v['size'], 'n': 1, 'quality': v['quality']}},
                )
                ids.append(('IMG', str(job.id), str(job.profile_id), v['aspect']))
                print(f'IMG#{{i+1}} queued id={{job.id}} profile={{job.profile_id}} aspect={{v["aspect"]}}')
            except Exception as e:
                print(f'IMG#{{i+1}} FAILED: {{e!r}}')
        for i in range(N_VID):
            v = VIDEO_VARIANTS[i % len(VIDEO_VARIANTS)]
            try:
                job = await job_service.create_job(
                    db, user_id=user.id, provider='grok', job_type='video',
                    prompt=v['prompt'], profile_id=None,
                    options={{'aspect': v['aspect'], 'resolution': v['resolution'],
                              'duration': v['duration'], 'mode': v['mode'], 'n': 1}},
                )
                ids.append(('VID', str(job.id), str(job.profile_id), f'{{v["resolution"]}}/{{v["duration"]}}s/{{v["mode"]}}'))
                print(f'VID#{{i+1}} queued id={{job.id}} profile={{job.profile_id}} variant={{v["resolution"]}}/{{v["duration"]}}s')
            except Exception as e:
                print(f'VID#{{i+1}} FAILED: {{e!r}}')
        print('--- JOB_IDS ---')
        for kind, jid, pid, label in ids:
            print(f'{{kind}}|{{jid}}|{{pid}}|{{label}}')

asyncio.run(main())
"""


# ─── Phase 3: poll all jobs ───────────────────────────────────────────────
PHASE3_TEMPLATE = """\
import asyncio, os, time
from app.core.database import SessionLocal
from app.models import Job
from sqlalchemy import select

IDS = {ids!r}
DEADLINE = float({deadline})
TERMINAL = {{'completed', 'success', 'failed', 'cancelled'}}

async def main():
    started = time.time()
    last = {{}}
    while time.time() - started < DEADLINE:
        async with SessionLocal() as db:
            rows = (await db.execute(select(Job).where(Job.id.in_(IDS)))).scalars().all()
        snapshot = {{str(r.id): r.status for r in rows}}
        # Print only on change
        for r in rows:
            jid = str(r.id)
            if last.get(jid) != r.status:
                elapsed = int(time.time() - started)
                print(f'[{{elapsed:>4}}s] {{jid[:8]}}: {{r.status}}')
                last[jid] = r.status
        if all(s in TERMINAL for s in snapshot.values()):
            break
        await asyncio.sleep(3)

    # Final summary
    async with SessionLocal() as db:
        rows = (await db.execute(select(Job).where(Job.id.in_(IDS)))).scalars().all()
    print()
    print('=== SUMMARY ===')
    for r in rows:
        status_icon = '✓' if r.status in ('completed','success') else '✗' if r.status == 'failed' else '⋯'
        url = r.result_url or '(no result)'
        err = (r.error_message or '')[:80]
        print(f'  {{status_icon}} {{str(r.id)[:8]}}  status={{r.status:<22}}  {{r.job_type}}  {{url}}  {{err}}')

asyncio.run(main())
"""


def main() -> int:
    args = parse_args()
    c = ssh()

    print("=== Phase 1: ensure VNC running for every logged_in profile ===")
    upload(c, "/tmp/phase1.py", PHASE1_SCRIPT)
    print(docker_exec_py(c, "/tmp/phase1.py", "/tmp/phase1.py"))

    # Give VNC containers time to bring up Chromium.
    print("(waiting 12s for fresh Chromium to settle...)")
    time.sleep(12)

    print(f"\n=== Phase 2: firing {args.images} image + {args.videos} video jobs ===")
    upload(c, "/tmp/phase2.py", PHASE2_TEMPLATE.format(
        email=args.email, n_img=args.images, n_vid=args.videos,
    ))
    p2 = docker_exec_py(c, "/tmp/phase2.py", "/tmp/phase2.py")
    print(p2)

    # Parse JOB_IDS section.
    ids = []
    in_ids = False
    for line in p2.splitlines():
        if line.strip() == "--- JOB_IDS ---":
            in_ids = True; continue
        if in_ids and "|" in line:
            kind, jid, pid, label = line.split("|", 3)
            ids.append(jid.strip())
    if not ids:
        print("no job IDs to poll — bailing")
        c.close(); return 1

    print(f"\n=== Phase 3: polling {len(ids)} jobs for up to {args.poll_seconds}s ===")
    upload(c, "/tmp/phase3.py", PHASE3_TEMPLATE.format(
        ids=ids, deadline=args.poll_seconds,
    ))
    print(docker_exec_py(c, "/tmp/phase3.py", "/tmp/phase3.py"))

    c.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
