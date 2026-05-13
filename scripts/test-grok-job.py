"""Fire one Grok image-gen job through the live pipeline + poll for result.

End-to-end smoke test:
  1. Open async DB session inside the running backend container
  2. Look up the super_admin user (or any user from CLI flag)
  3. Call service.create_job() — same code path the FE → router uses,
     so the worker picks it up identically
  4. Poll the jobs row every 2s for up to 90s
  5. Print final status + result_url

This is the canonical "is everything wired right?" check after a deploy.
Run from the laptop; SFTPs itself into /tmp on the VPS and exec's it
inside grokflow-backend-1 via docker exec.

Usage:
    python scripts/test-grok-job.py
    python scripts/test-grok-job.py --email someone@else.com
    python scripts/test-grok-job.py --prompt 'a red panda eating dim sum'
"""
from __future__ import annotations

import argparse
import os
import sys
import textwrap

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

import paramiko  # type: ignore

HOST = os.getenv("VPS_HOST", "192.168.1.16")
USER_VPS = os.getenv("VPS_USER", "vpsroot")
PASSWORD = os.getenv("VPS_PASSWORD", "123456789")


def parse_args():
    ap = argparse.ArgumentParser()
    ap.add_argument("--email", default="admin@grokflow.io",
                    help="GrokFlow user to attribute the job to")
    ap.add_argument("--prompt", default="A serene japanese garden at dusk, watercolor style",
                    help="The image-gen prompt")
    ap.add_argument("--profile-id", default=None,
                    help="Pin to a specific profile (skip auto-pick rotation)")
    ap.add_argument("--aspect", default="1:1", help="aspect ratio (1:1, 16:9, …)")
    ap.add_argument("--poll-seconds", type=int, default=120,
                    help="how long to keep polling for completion")
    return ap.parse_args()


def main() -> int:
    args = parse_args()

    # The script that runs inside the backend container. It opens a fresh
    # async DB session, kicks off the job, then exits — polling happens
    # in a separate exec call so paramiko stays responsive.
    fire_script = textwrap.dedent(f"""\
        import asyncio, sys, json
        from app.core.database import SessionLocal
        from app.models import User
        from sqlalchemy import select
        from app.modules.grok.jobs import service as job_service

        async def main():
            async with SessionLocal() as db:
                user = (await db.execute(
                    select(User).where(User.email == {args.email!r})
                )).scalar_one_or_none()
                if not user:
                    print('USER_NOT_FOUND')
                    return
                try:
                    pid = {args.profile_id!r}
                    import uuid as _uuid
                    job = await job_service.create_job(
                        db,
                        user_id=user.id,
                        provider='grok',
                        job_type='image',
                        prompt={args.prompt!r},
                        profile_id=_uuid.UUID(pid) if pid else None,
                        options={{
                            'aspect': {args.aspect!r},
                            'size': '1024x1024',
                            'n': 1,
                            'quality': 'speed',
                        }},
                    )
                    print('JOB_ID=' + str(job.id))
                    print('PROFILE_ID=' + str(job.profile_id))
                except Exception as e:
                    print('CREATE_FAILED: ' + repr(e))

        asyncio.run(main())
    """)

    poll_script = textwrap.dedent("""\
        import asyncio, sys, time, os
        from app.core.database import SessionLocal
        from app.models import Job, JobLog
        from sqlalchemy import select

        JOB_ID = os.environ['JOB_ID']
        DEADLINE = float(os.environ.get('DEADLINE', '120'))

        async def main():
            started = time.time()
            last_status = None
            async with SessionLocal() as db:
                while time.time() - started < DEADLINE:
                    job = (await db.execute(
                        select(Job).where(Job.id == JOB_ID)
                    )).scalar_one_or_none()
                    if not job:
                        print('VANISHED')
                        return
                    if job.status != last_status:
                        print(f'[{int(time.time()-started)}s] status={job.status}')
                        last_status = job.status
                    if job.status in ('completed', 'failed', 'cancelled'):
                        print('RESULT_URL=' + (job.result_url or '(none)'))
                        print('ERROR=' + (job.error_message or '(none)'))
                        logs = (await db.execute(
                            select(JobLog).where(JobLog.job_id == JOB_ID).order_by(JobLog.created_at)
                        )).scalars().all()
                        print('--- job logs ---')
                        for lg in logs[-10:]:
                            print(f'  {lg.level}: {lg.message}')
                        return
                    await asyncio.sleep(2)
                print(f'TIMEOUT_AT_{int(DEADLINE)}s status={last_status}')

        asyncio.run(main())
    """)

    c = paramiko.SSHClient()
    c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    c.connect(HOST, username=USER_VPS, password=PASSWORD, timeout=20)

    # Upload both scripts via SFTP — safer than shell-escaping multi-line py.
    sftp = c.open_sftp()
    with sftp.open("/tmp/grokflow-fire-job.py", "w") as f:
        f.write(fire_script)
    with sftp.open("/tmp/grokflow-poll-job.py", "w") as f:
        f.write(poll_script)
    sftp.close()

    # Phase 1: fire the job.
    print(f"=== firing Grok image job (email={args.email}) ===")
    print(f"    prompt: {args.prompt}")
    cmd = (
        f"echo {PASSWORD} | sudo -S "
        "docker cp /tmp/grokflow-fire-job.py grokflow-backend-1:/tmp/fire.py && "
        f"echo {PASSWORD} | sudo -S "
        # cwd /app so `from app.X import Y` resolves
        "docker exec -e PYTHONPATH=/app -w /app grokflow-backend-1 python /tmp/fire.py 2>&1"
    )
    _, out, _ = c.exec_command(cmd, timeout=60)
    out.channel.settimeout(60.0)
    fire_out = out.read().decode("utf-8", errors="replace")
    print(fire_out)

    # Parse JOB_ID from fire output.
    job_id = None
    for line in fire_out.splitlines():
        if line.startswith("JOB_ID="):
            job_id = line.split("=", 1)[1].strip()
            break
    if not job_id:
        print("=== could not extract JOB_ID — bailing ===")
        c.close()
        return 1

    # Phase 2: poll.
    print(f"\n=== polling job {job_id} for up to {args.poll_seconds}s ===")
    cmd2 = (
        f"echo {PASSWORD} | sudo -S "
        "docker cp /tmp/grokflow-poll-job.py grokflow-backend-1:/tmp/poll.py && "
        f"echo {PASSWORD} | sudo -S "
        f"docker exec -w /app -e PYTHONPATH=/app -e JOB_ID={job_id} -e DEADLINE={args.poll_seconds} "
        "grokflow-backend-1 python /tmp/poll.py 2>&1"
    )
    _, out, _ = c.exec_command(cmd2, timeout=args.poll_seconds + 30)
    out.channel.settimeout(args.poll_seconds + 30.0)
    print(out.read().decode("utf-8", errors="replace"))

    c.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
