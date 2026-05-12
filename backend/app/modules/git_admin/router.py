"""Admin git / deploy controls.

The backend container can't run shell commands on the host directly (no
shared filesystem for the .git dir, no host binaries). So both status and
deploy work by SSHing to the host as the admin's chosen user.

SSH config comes from env vars (set in .env.prod):
    HOST_SSH_HOST       — defaults to "host.docker.internal" (Linux: routed
                          via the extra_hosts entry in docker-compose).
    HOST_SSH_PORT       — defaults 22.
    HOST_SSH_USER       — defaults "vpsroot".
    HOST_SSH_PASSWORD   — required for password auth.
    HOST_GROKFLOW_PATH  — defaults "/home/vpsroot/grokflow".

GitHub remote-state lookup uses the unauthenticated GitHub API (the repo
is public). If rate-limited, the "behind" indicator just falls back to
unknown — the local view still works.
"""
from __future__ import annotations

import os
from typing import Literal

import httpx
import paramiko
from fastapi import APIRouter
from pydantic import BaseModel

from app.core.deps import AdminUser, DbSession  # noqa: F401  (DbSession unused; future audit)
from app.core.exceptions import AppError

router = APIRouter(prefix="/api/admin/git", tags=["admin-git"])


SSH_HOST = os.environ.get("HOST_SSH_HOST", "host.docker.internal")
SSH_PORT = int(os.environ.get("HOST_SSH_PORT", "22"))
SSH_USER = os.environ.get("HOST_SSH_USER", "vpsroot")
SSH_PASSWORD = os.environ.get("HOST_SSH_PASSWORD", "")
GROKFLOW_PATH = os.environ.get("HOST_GROKFLOW_PATH", "/home/vpsroot/grokflow")

GITHUB_REPO = os.environ.get("GITHUB_REPO", "nguyenlehai-dev/GrokFlow")
GITHUB_BRANCH = os.environ.get("GITHUB_BRANCH", "prod")


class SshConfigError(AppError):
    def __init__(self, message: str) -> None:
        super().__init__(500, "ssh_not_configured", message)


def _client() -> paramiko.SSHClient:
    if not SSH_PASSWORD:
        raise SshConfigError(
            "HOST_SSH_PASSWORD chưa được set trong .env.prod — không thể chạy lệnh trên host."
        )
    c = paramiko.SSHClient()
    c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    c.connect(
        hostname=SSH_HOST,
        port=SSH_PORT,
        username=SSH_USER,
        password=SSH_PASSWORD,
        timeout=10,
        banner_timeout=10,
    )
    return c


def _run(cmd: str, timeout: int = 30) -> tuple[int, str, str]:
    """Run a shell command on the host via SSH. Returns (exit_code, stdout, stderr)."""
    c = _client()
    try:
        stdin, stdout, stderr = c.exec_command(cmd, timeout=timeout)
        exit_code = stdout.channel.recv_exit_status()
        out = stdout.read().decode("utf-8", errors="replace")
        err = stderr.read().decode("utf-8", errors="replace")
        return exit_code, out, err
    finally:
        c.close()


# ---------------- Schemas ----------------


class GitCommit(BaseModel):
    hash: str
    short: str
    author: str
    date: str
    message: str


class ContainerStatus(BaseModel):
    name: str
    status: str
    image_id: str | None = None
    started_at: str | None = None


class GitStatus(BaseModel):
    branch: str
    current_commit: GitCommit | None
    recent_commits: list[GitCommit]
    remote_latest: GitCommit | None
    commits_behind: int | None
    is_dirty: bool
    containers: list[ContainerStatus]


class DeployRequest(BaseModel):
    services: list[Literal["backend", "frontend", "worker", "idle-cleanup", "all"]] = ["backend", "frontend"]
    pull: bool = True
    rebuild: bool = True


class DeployResult(BaseModel):
    ok: bool
    duration_seconds: float
    log: str


# ---------------- Helpers ----------------


def _parse_log(text: str) -> list[GitCommit]:
    """Parse `git log` output with a record separator we control (NUL byte).

    Each record is 4 tab-separated fields: hash, author, date, subject.
    Using tab + null avoids any clash with commit body whitespace.
    """
    commits: list[GitCommit] = []
    for record in text.split("\x1e"):
        record = record.strip()
        if not record:
            continue
        parts = record.split("\x1f")
        if len(parts) < 4:
            continue
        full_hash, author, date, subject = parts[0], parts[1], parts[2], parts[3]
        commits.append(GitCommit(
            hash=full_hash,
            short=full_hash[:7],
            author=author,
            date=date,
            message=subject,
        ))
    return commits


def _git_log_cmd(n: int) -> str:
    # Record-sep \x1e between commits, field-sep \x1f between fields.
    # %s = subject only (no body), so multi-line bodies don't trip the parser.
    fmt = "%H%x1f%an <%ae>%x1f%cI%x1f%s%x1e"
    return f"cd {GROKFLOW_PATH} && git log -n {n} --pretty=format:'{fmt}' --no-merges"


# ---------------- Endpoints ----------------


@router.get("/status", response_model=GitStatus)
async def git_status(admin: AdminUser) -> GitStatus:
    # 1) Branch + recent commits
    code, out, err = _run(f"cd {GROKFLOW_PATH} && git rev-parse --abbrev-ref HEAD")
    branch = (out or err).strip() or "unknown"

    code, out, _ = _run(_git_log_cmd(10))
    recent = _parse_log(out) if code == 0 else []
    current = recent[0] if recent else None

    # 2) Dirty?
    code, out, _ = _run(f"cd {GROKFLOW_PATH} && git status --porcelain")
    is_dirty = bool(out.strip())

    # 3) Remote latest commit on the tracked branch via GitHub API.
    remote_latest: GitCommit | None = None
    commits_behind: int | None = None
    try:
        async with httpx.AsyncClient(timeout=8) as cli:
            r = await cli.get(
                f"https://api.github.com/repos/{GITHUB_REPO}/commits",
                params={"sha": branch, "per_page": 1},
                headers={"Accept": "application/vnd.github+json"},
            )
            if r.status_code == 200:
                arr = r.json()
                if arr:
                    item = arr[0]
                    remote_latest = GitCommit(
                        hash=item["sha"],
                        short=item["sha"][:7],
                        author=item["commit"]["author"]["name"],
                        date=item["commit"]["author"]["date"],
                        message=item["commit"]["message"].splitlines()[0] if item["commit"]["message"] else "",
                    )
    except Exception:  # noqa: BLE001
        pass

    if remote_latest and current:
        # Count how many remote commits are ahead of local using GitHub compare API.
        try:
            async with httpx.AsyncClient(timeout=8) as cli:
                r = await cli.get(
                    f"https://api.github.com/repos/{GITHUB_REPO}/compare/{current.hash}...{remote_latest.hash}",
                    headers={"Accept": "application/vnd.github+json"},
                )
                if r.status_code == 200:
                    commits_behind = int(r.json().get("ahead_by", 0))
        except Exception:  # noqa: BLE001
            pass

    # 4) Container statuses (via docker ps on host)
    code, out, _ = _run(
        "docker ps -a --format '{{.Names}}|{{.Status}}|{{.Image}}|{{.RunningFor}}' | grep grokflow"
    )
    containers: list[ContainerStatus] = []
    for line in out.strip().splitlines():
        parts = line.split("|")
        if len(parts) >= 2:
            containers.append(ContainerStatus(
                name=parts[0],
                status=parts[1],
                image_id=parts[2] if len(parts) > 2 else None,
                started_at=parts[3] if len(parts) > 3 else None,
            ))

    return GitStatus(
        branch=branch,
        current_commit=current,
        recent_commits=recent,
        remote_latest=remote_latest,
        commits_behind=commits_behind,
        is_dirty=is_dirty,
        containers=containers,
    )


@router.post("/deploy", response_model=DeployResult)
async def deploy(payload: DeployRequest, admin: AdminUser) -> DeployResult:
    """Pull latest + rebuild selected services on host.

    The whole flow runs in a single SSH session: git pull, then a
    `docker compose up -d --build <services>` for each service requested.
    Output from each step is concatenated into `log`.
    """
    import time

    services = payload.services
    if "all" in services:
        services = ["backend", "frontend", "worker", "idle-cleanup"]

    compose_prefix = (
        f"cd {GROKFLOW_PATH} && "
        f"docker compose --env-file .env.prod -f docker-compose.intranet.yml"
    )

    steps: list[str] = []
    if payload.pull:
        steps.append(f"cd {GROKFLOW_PATH} && git pull --ff-only")
    if payload.rebuild:
        steps.append(f"{compose_prefix} build --build-arg VITE_API_BASE_URL= {' '.join(services)}")
    steps.append(f"{compose_prefix} up -d --force-recreate {' '.join(services)}")

    start = time.monotonic()
    log_chunks: list[str] = []
    ok = True
    for step in steps:
        code, out, err = _run(step, timeout=600)
        log_chunks.append(f"$ {step}\n{out}{err}\n[exit={code}]\n")
        if code != 0:
            ok = False
            break

    duration = time.monotonic() - start
    return DeployResult(ok=ok, duration_seconds=round(duration, 1), log="\n".join(log_chunks))
