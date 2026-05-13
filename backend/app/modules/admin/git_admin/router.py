"""Admin git / deploy controls — multi-repo.

Each row in `git_repos` is a tab in the /admin/git UI. The backend SSHs to
the host (paramiko, password from .env.prod) and runs `git` + `docker
compose` inside the repo's local_path. GitHub state comes from the public
REST API.

CRUD: GET/POST/PATCH/DELETE /api/admin/git/repos
Per-repo status:  GET  /api/admin/git/repos/{id}/status
Per-repo deploy:  POST /api/admin/git/repos/{id}/deploy

The legacy single-repo endpoints (/api/admin/git/status, /api/admin/git/deploy)
remain and target the first repo by sort_order, so frontends that don't
know about repos keep working.
"""
from __future__ import annotations

import os
import time
import uuid
from typing import Literal

import httpx
import paramiko
from fastapi import APIRouter, status as http_status
from pydantic import BaseModel, Field
from sqlalchemy import select

from app.core.deps import SuperAdminUser as AdminUser, DbSession
from app.core.exceptions import AppError, InvalidPayload, NotFound
from app.models import GitRepo
from app.modules.admin.audit import service as audit

router = APIRouter(prefix="/api/admin/git", tags=["admin-git"])


SSH_HOST = os.environ.get("HOST_SSH_HOST", "host.docker.internal")
SSH_PORT = int(os.environ.get("HOST_SSH_PORT", "22"))
SSH_USER = os.environ.get("HOST_SSH_USER", "vpsroot")
SSH_PASSWORD = os.environ.get("HOST_SSH_PASSWORD", "")


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
        hostname=SSH_HOST, port=SSH_PORT, username=SSH_USER, password=SSH_PASSWORD,
        timeout=10, banner_timeout=10,
    )
    return c


def _run(cmd: str, timeout: int = 30) -> tuple[int, str, str]:
    c = _client()
    try:
        _, stdout, stderr = c.exec_command(cmd, timeout=timeout)
        code = stdout.channel.recv_exit_status()
        out = stdout.read().decode("utf-8", errors="replace")
        err = stderr.read().decode("utf-8", errors="replace")
        return code, out, err
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


class GitRepoOut(BaseModel):
    id: uuid.UUID
    label: str
    github_repo: str
    branch: str
    local_path: str
    compose_file: str | None
    env_file: str | None
    services: list[str]
    sort_order: int

    class Config:
        from_attributes = True


class GitRepoCreate(BaseModel):
    label: str = Field(min_length=1, max_length=100)
    github_repo: str = Field(min_length=3, max_length=255)
    branch: str = Field(default="main", min_length=1, max_length=100)
    local_path: str = Field(min_length=1)
    compose_file: str | None = None
    env_file: str | None = None
    services: list[str] = Field(default_factory=list)
    sort_order: int = 0


class GitRepoUpdate(BaseModel):
    label: str | None = None
    github_repo: str | None = None
    branch: str | None = None
    local_path: str | None = None
    compose_file: str | None = None
    env_file: str | None = None
    services: list[str] | None = None
    sort_order: int | None = None


class GitStatus(BaseModel):
    repo: GitRepoOut
    branch: str
    current_commit: GitCommit | None
    recent_commits: list[GitCommit]
    remote_latest: GitCommit | None
    commits_behind: int | None
    is_dirty: bool
    containers: list[ContainerStatus]


class DeployRequest(BaseModel):
    services: list[str] | None = None  # None = use repo's default
    pull: bool = True
    rebuild: bool = True


class DeployResult(BaseModel):
    ok: bool
    duration_seconds: float
    log: str


# ---------------- Helpers ----------------


def _parse_log(text: str) -> list[GitCommit]:
    commits: list[GitCommit] = []
    for record in text.split("\x1e"):
        record = record.strip()
        if not record:
            continue
        parts = record.split("\x1f")
        if len(parts) < 4:
            continue
        full_hash, author, date, subject = parts
        commits.append(GitCommit(
            hash=full_hash, short=full_hash[:7],
            author=author, date=date, message=subject,
        ))
    return commits


def _log_cmd(local_path: str, n: int) -> str:
    fmt = "%H%x1f%an <%ae>%x1f%cI%x1f%s%x1e"
    return f"cd {local_path} && git log -n {n} --pretty=format:'{fmt}' --no-merges"


def _compose_prefix(repo: GitRepo) -> str:
    parts = [f"cd {repo.local_path}", "docker compose"]
    if repo.env_file:
        parts.append(f"--env-file {repo.env_file}")
    if repo.compose_file:
        parts.append(f"-f {repo.compose_file}")
    return " && ".join(parts[:1]) + " && " + " ".join(parts[1:])


async def _build_status(repo: GitRepo) -> GitStatus:
    """Pull all status info for one repo."""
    # 1) Branch + commits
    code, out, err = _run(f"cd {repo.local_path} && git rev-parse --abbrev-ref HEAD")
    branch = (out or err).strip() or repo.branch

    code, out, _ = _run(_log_cmd(repo.local_path, 10))
    recent = _parse_log(out) if code == 0 else []
    current = recent[0] if recent else None

    # 2) Dirty?
    code, out, _ = _run(f"cd {repo.local_path} && git status --porcelain")
    is_dirty = bool(out.strip())

    # 3) Remote latest commit via GitHub API
    remote_latest: GitCommit | None = None
    commits_behind: int | None = None
    try:
        async with httpx.AsyncClient(timeout=8) as cli:
            r = await cli.get(
                f"https://api.github.com/repos/{repo.github_repo}/commits",
                params={"sha": branch, "per_page": 1},
                headers={"Accept": "application/vnd.github+json"},
            )
            if r.status_code == 200:
                arr = r.json()
                if arr:
                    item = arr[0]
                    remote_latest = GitCommit(
                        hash=item["sha"], short=item["sha"][:7],
                        author=item["commit"]["author"]["name"],
                        date=item["commit"]["author"]["date"],
                        message=(item["commit"]["message"] or "").splitlines()[0],
                    )
    except Exception:  # noqa: BLE001
        pass

    if remote_latest and current:
        try:
            async with httpx.AsyncClient(timeout=8) as cli:
                r = await cli.get(
                    f"https://api.github.com/repos/{repo.github_repo}/compare/{current.hash}...{remote_latest.hash}",
                    headers={"Accept": "application/vnd.github+json"},
                )
                if r.status_code == 200:
                    commits_behind = int(r.json().get("ahead_by", 0))
        except Exception:  # noqa: BLE001
            pass

    # 4) Containers — match by label prefix derived from repo label.
    # Heuristic: lowercased label is the docker-compose project name. Falls
    # back to the directory basename when label doesn't match anything.
    project = repo.label.lower().replace(" ", "-")
    code, out, _ = _run(
        f"docker ps -a --format '{{{{.Names}}}}|{{{{.Status}}}}|{{{{.Image}}}}|{{{{.RunningFor}}}}' "
        f"| grep -E '^{project}-|^{os.path.basename(repo.local_path)}-' "
        f"|| true"
    )
    containers: list[ContainerStatus] = []
    for line in out.strip().splitlines():
        parts = line.split("|")
        if len(parts) >= 2:
            containers.append(ContainerStatus(
                name=parts[0], status=parts[1],
                image_id=parts[2] if len(parts) > 2 else None,
                started_at=parts[3] if len(parts) > 3 else None,
            ))

    return GitStatus(
        repo=GitRepoOut.model_validate(repo),
        branch=branch, current_commit=current, recent_commits=recent,
        remote_latest=remote_latest, commits_behind=commits_behind,
        is_dirty=is_dirty, containers=containers,
    )


async def _do_deploy(repo: GitRepo, payload: DeployRequest) -> DeployResult:
    services = payload.services if payload.services is not None else repo.services
    services = [s for s in services if s]

    compose = _compose_prefix(repo)
    steps: list[str] = []
    if payload.pull:
        steps.append(f"cd {repo.local_path} && git pull --ff-only")
    svcs_str = " ".join(services) if services else ""
    if payload.rebuild:
        # --build-arg only applies if the project uses VITE_API_BASE_URL; harmless otherwise.
        steps.append(f"{compose} build --build-arg VITE_API_BASE_URL= {svcs_str}".rstrip())
    steps.append(f"{compose} up -d --force-recreate {svcs_str}".rstrip())

    start = time.monotonic()
    log_chunks: list[str] = []
    ok = True
    for step in steps:
        code, out, err = _run(step, timeout=900)
        log_chunks.append(f"$ {step}\n{out}{err}\n[exit={code}]\n")
        if code != 0:
            ok = False
            break

    return DeployResult(
        ok=ok,
        duration_seconds=round(time.monotonic() - start, 1),
        log="\n".join(log_chunks),
    )


# ---------------- Repo CRUD ----------------


@router.get("/repos", response_model=list[GitRepoOut])
async def list_repos(admin: AdminUser, db: DbSession) -> list[GitRepo]:
    rows = (await db.execute(
        select(GitRepo).order_by(GitRepo.sort_order, GitRepo.label)
    )).scalars().all()
    return list(rows)


@router.post("/repos", response_model=GitRepoOut, status_code=http_status.HTTP_201_CREATED)
async def create_repo(payload: GitRepoCreate, admin: AdminUser, db: DbSession) -> GitRepo:
    repo = GitRepo(
        label=payload.label,
        github_repo=payload.github_repo,
        branch=payload.branch,
        local_path=payload.local_path,
        compose_file=payload.compose_file,
        env_file=payload.env_file,
        services=payload.services,
        sort_order=payload.sort_order,
    )
    db.add(repo)
    await db.flush()
    await audit.log_action(
        db, user_id=admin.id, action="admin_create_git_repo",
        target_type="git_repo", target_id=repo.id, metadata={"label": repo.label},
    )
    await db.commit()
    await db.refresh(repo)
    return repo


@router.patch("/repos/{repo_id}", response_model=GitRepoOut)
async def update_repo(
    repo_id: uuid.UUID, payload: GitRepoUpdate, admin: AdminUser, db: DbSession,
) -> GitRepo:
    repo = await db.get(GitRepo, repo_id)
    if not repo:
        raise NotFound("git_repo")
    changes: dict = {}
    for field in ("label", "github_repo", "branch", "local_path", "compose_file",
                  "env_file", "services", "sort_order"):
        v = getattr(payload, field)
        if v is not None:
            setattr(repo, field, v)
            changes[field] = v if not isinstance(v, list) else "updated"
    await audit.log_action(
        db, user_id=admin.id, action="admin_update_git_repo",
        target_type="git_repo", target_id=repo.id, metadata=changes,
    )
    await db.commit()
    await db.refresh(repo)
    return repo


@router.delete("/repos/{repo_id}", status_code=http_status.HTTP_204_NO_CONTENT, response_model=None)
async def delete_repo(repo_id: uuid.UUID, admin: AdminUser, db: DbSession):
    repo = await db.get(GitRepo, repo_id)
    if not repo:
        raise NotFound("git_repo")
    await audit.log_action(
        db, user_id=admin.id, action="admin_delete_git_repo",
        target_type="git_repo", target_id=repo.id, metadata={"label": repo.label},
    )
    await db.delete(repo)
    await db.commit()


# ---------------- Per-repo status/deploy ----------------


@router.get("/repos/{repo_id}/status", response_model=GitStatus)
async def repo_status(repo_id: uuid.UUID, admin: AdminUser, db: DbSession) -> GitStatus:
    repo = await db.get(GitRepo, repo_id)
    if not repo:
        raise NotFound("git_repo")
    return await _build_status(repo)


@router.post("/repos/{repo_id}/deploy", response_model=DeployResult)
async def repo_deploy(
    repo_id: uuid.UUID, payload: DeployRequest, admin: AdminUser, db: DbSession,
) -> DeployResult:
    repo = await db.get(GitRepo, repo_id)
    if not repo:
        raise NotFound("git_repo")
    return await _do_deploy(repo, payload)


# ---------------- .env editor ----------------
# Lives next to deploy so the admin can edit env BEFORE bumping a build.
# The file path is `<repo.local_path>/<repo.env_file or '.env.prod'>` —
# repo.env_file falls back to '.env.prod' for backward compat with rows
# created before the field existed.

class EnvOut(BaseModel):
    path: str
    env: str


class EnvUpdate(BaseModel):
    content: str


def _env_file_path(repo: GitRepo) -> str:
    """Resolve the env file path. Falls back to '.env.prod' to match what
    docker compose --env-file uses by convention in this project."""
    import os
    from pathlib import Path
    fname = repo.env_file or ".env.prod"
    return str(Path(repo.local_path) / fname)


@router.get("/repos/{repo_id}/env", response_model=EnvOut)
async def repo_get_env(
    repo_id: uuid.UUID, admin: AdminUser, db: DbSession,
) -> EnvOut:
    """Super_admin only — env files often contain DB passwords, JWT
    secrets, Cloudflare tokens. AdminUser alias here resolves to
    SuperAdminUser (see top-of-file import)."""
    import os
    repo = await db.get(GitRepo, repo_id)
    if not repo:
        raise NotFound("git_repo")
    path = _env_file_path(repo)
    try:
        # Backend container is inside Docker; the env file lives on the
        # host. The deploy ssh path already mounts /home/vpsroot via the
        # entrypoint volume bind. If not accessible, ssh-cat as fallback.
        if os.path.exists(path):
            with open(path, encoding="utf-8") as f:
                content = f.read()
        else:
            # Fallback: ssh + cat — _ssh_run exists for deploy commands.
            cmd = f"cat {path} 2>/dev/null || echo '# (file missing)'"
            content = await _ssh_run(cmd)
    except Exception as exc:  # noqa: BLE001
        raise InvalidPayload(f"Không đọc được {path}: {exc}")
    return EnvOut(path=path, env=content)


@router.put("/repos/{repo_id}/env", response_model=EnvOut)
async def repo_set_env(
    repo_id: uuid.UUID, payload: EnvUpdate,
    admin: AdminUser, db: DbSession,
) -> EnvOut:
    import os
    repo = await db.get(GitRepo, repo_id)
    if not repo:
        raise NotFound("git_repo")
    path = _env_file_path(repo)

    # Validate: line-based key=value, no leading control chars. Keep it
    # generous (allow # comments + blank lines) — admin owns the format.
    lines = (payload.content or "").splitlines()
    for i, line in enumerate(lines, 1):
        if line and not line.startswith("#") and "=" not in line:
            raise InvalidPayload(f"Dòng {i} không phải định dạng KEY=VALUE: {line[:60]}")

    try:
        if os.path.exists(os.path.dirname(path)):
            # Direct write — faster + atomic via os.replace.
            tmp = f"{path}.tmp"
            with open(tmp, "w", encoding="utf-8", newline="\n") as f:
                f.write(payload.content)
            os.chmod(tmp, 0o600)
            os.replace(tmp, path)
        else:
            # Cross-container path — write via SSH + tee. Quoting via
            # base64 sidesteps shell escaping for $-bearing secrets.
            import base64
            b64 = base64.b64encode(payload.content.encode("utf-8")).decode("ascii")
            cmd = (
                f"echo {b64} | base64 -d > {path}.tmp && "
                f"chmod 600 {path}.tmp && mv {path}.tmp {path}"
            )
            await _ssh_run(cmd)
    except Exception as exc:  # noqa: BLE001
        raise InvalidPayload(f"Không ghi được {path}: {exc}")

    await audit.log_action(
        db, user_id=admin.id, action="git_repo_env_updated",
        target_type="git_repo", target_id=repo.id,
        metadata={"path": path, "bytes": len(payload.content)},
    )
    await db.commit()
    return EnvOut(path=path, env=payload.content)


# ---------------- Legacy single-repo endpoints (resolve to first repo) ----------------


async def _first_repo(db) -> GitRepo:
    repo = (await db.execute(
        select(GitRepo).order_by(GitRepo.sort_order, GitRepo.label).limit(1)
    )).scalar_one_or_none()
    if not repo:
        raise InvalidPayload("Chưa có git repo nào được cấu hình. Tạo qua /admin/git → Tạo repo.")
    return repo


@router.get("/status", response_model=GitStatus)
async def legacy_status(admin: AdminUser, db: DbSession) -> GitStatus:
    return await _build_status(await _first_repo(db))


@router.post("/deploy", response_model=DeployResult)
async def legacy_deploy(payload: DeployRequest, admin: AdminUser, db: DbSession) -> DeployResult:
    return await _do_deploy(await _first_repo(db), payload)
