"""Runtime ops for the module marketplace — the part that actually talks
to docker + postgres + nginx on the host.

Kept separate from `app/modules/admin_modules/installer.py` (which just
orchestrates) so each side-effect has one clear place to maintain:

  provision_db / drop_db      → postgres DDL (schema + role)
  build_images / spawn_*      → docker build / run via the host socket
  stop_containers / remove_*  → cleanup
  wait_healthy                → poll backend /health endpoint
  write_vhost / remove_vhost  → nginx config (when bind-mounted)

The backend container has /var/run/docker.sock mounted (see
docker-compose.override.yml), so docker SDK calls from inside the
backend reach the host daemon and spawn modules onto the same docker
network the rest of GrokFlow sits on.

Every function is best-effort + idempotent: callers can retry without
worrying about partial state, and `uninstall` runs each cleanup step
regardless of which one errored. This trades a bit of fragility for
the install flow (we may leak a half-built image) for never bricking
the host on a flaky uninstall.
"""

from __future__ import annotations

import asyncio
import contextlib
import io
import os
import secrets
import tarfile
import time
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

import asyncpg
import httpx

# `docker` is imported lazily so unit tests / non-docker dev environments
# don't fail at import time.


# ─── Paths + defaults ──────────────────────────────────────────────────


MODULE_ROOT = Path(os.environ.get("MODULE_ROOT", "/app/modules-data"))

# Where the host wants nginx vhost files. On the VPS this dir is bind-
# mounted from /etc/nginx/grokflow-vhosts/ — see docker-compose.intranet.yml.
# Local dev usually doesn't have nginx set up; we silently skip when the
# directory isn't writable.
VHOSTS_DIR = Path(os.environ.get("NGINX_VHOSTS_DIR", "/host_nginx_vhosts"))

# Network the spawned module containers attach to. Has to match the network
# the GrokFlow backend itself sits on or nginx + service-token round-trips
# won't resolve.
MODULE_NETWORK = os.environ.get("MODULE_DOCKER_NETWORK", "grokflow_default")

# Per-host caps applied on top of whatever the manifest requests, so a
# malicious manifest can't blow up the box. Manifest can ask for less.
HARD_CAP_MEM_BYTES = 2 * 1024**3   # 2 GiB
HARD_CAP_CPUS = 2.0


# ─── Docker SDK helpers ────────────────────────────────────────────────


def _docker():
    """Return a docker.DockerClient. Lazy import so test environments
    without docker installed can still import this module."""
    import docker
    return docker.from_env()


# ─── Postgres helpers ──────────────────────────────────────────────────


def _admin_dsn() -> str:
    """asyncpg-compatible DSN for the postgres role that owns the main DB.

    SQLAlchemy stores it as ``postgresql+asyncpg://user:pw@host:port/db``;
    asyncpg wants the plain ``postgresql://`` form. Strip the +asyncpg
    suffix so we can connect with the raw driver to run DDL outside
    SQLAlchemy's transactional scope (CREATE SCHEMA + GRANTs need their
    own connection so they're visible to the new role immediately).
    """
    from app.core.config import settings
    url = settings.DATABASE_URL.replace("+asyncpg", "")
    parsed = urlparse(url)
    return url, parsed.path.lstrip("/")


async def provision_db(slug: str, schema: str, db_user: str,
                       db_password: str,
                       read_core_tables: list[str] | None = None) -> None:
    """Create the module's schema + role with usage on JUST that schema.

    The role gets:
      * USAGE + CREATE on its own schema (so its alembic can DDL)
      * ALL on tables in its own schema (incl. future tables via DEFAULT
        PRIVILEGES, so newly migrated tables are usable too)
      * SELECT on the whitelisted core tables (read_core_tables) so the
        module can join against shared data without copying it

    No access to public schema beyond the whitelist — separation of
    concerns is enforced at the postgres level, not just in code.
    """
    url, _db = _admin_dsn()
    conn = await asyncpg.connect(url)
    try:
        # CREATE SCHEMA / ROLE are not parameterizable — quote the identifier
        # ourselves. Names come from validated slug (regex'd in installer),
        # so injection isn't possible here, but we still belt-and-braces.
        schema_q = f'"{schema}"'
        user_q = f'"{db_user}"'
        pw_lit = "'" + db_password.replace("'", "''") + "'"

        await conn.execute(f"CREATE SCHEMA IF NOT EXISTS {schema_q}")

        # CREATE ROLE is not idempotent — guard ourselves.
        exists = await conn.fetchval(
            "SELECT 1 FROM pg_roles WHERE rolname = $1", db_user
        )
        if exists:
            await conn.execute(f"ALTER ROLE {user_q} WITH PASSWORD {pw_lit}")
        else:
            await conn.execute(
                f"CREATE ROLE {user_q} WITH LOGIN PASSWORD {pw_lit}"
            )

        await conn.execute(f"GRANT USAGE, CREATE ON SCHEMA {schema_q} TO {user_q}")
        await conn.execute(
            f"GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA {schema_q} TO {user_q}"
        )
        await conn.execute(
            f"ALTER DEFAULT PRIVILEGES IN SCHEMA {schema_q} GRANT ALL ON TABLES TO {user_q}"
        )
        await conn.execute(
            f"GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA {schema_q} TO {user_q}"
        )
        await conn.execute(
            f"ALTER DEFAULT PRIVILEGES IN SCHEMA {schema_q} GRANT ALL ON SEQUENCES TO {user_q}"
        )

        for tbl in read_core_tables or []:
            if not tbl.isidentifier():
                continue   # skip junk
            with contextlib.suppress(Exception):
                await conn.execute(f'GRANT SELECT ON public."{tbl}" TO {user_q}')
    finally:
        await conn.close()


async def drop_db(schema: str, db_user: str) -> None:
    """Best-effort tear-down. Swallows errors so partial states can still
    be cleaned up — the goal is "leave nothing behind", not "fail loudly"."""
    url, _ = _admin_dsn()
    try:
        conn = await asyncpg.connect(url)
    except Exception:
        return
    try:
        schema_q = f'"{schema}"'
        user_q = f'"{db_user}"'
        with contextlib.suppress(Exception):
            await conn.execute(f"DROP SCHEMA IF EXISTS {schema_q} CASCADE")
        with contextlib.suppress(Exception):
            await conn.execute(f"DROP OWNED BY {user_q} CASCADE")
        with contextlib.suppress(Exception):
            await conn.execute(f"DROP ROLE IF EXISTS {user_q}")
    finally:
        await conn.close()


# ─── Docker build/run ──────────────────────────────────────────────────


def _build_image(work_dir: Path, dockerfile_rel: str, tag: str,
                 build_args: dict[str, str] | None = None) -> str:
    """Build a docker image from work_dir / dockerfile_rel.

    Returns the resulting image tag. Streams build logs to stdout so they
    appear in `docker logs grokflow-backend-1` (useful for debugging
    install failures via the container log).
    """
    client = _docker()
    dockerfile_path = work_dir / dockerfile_rel
    if not dockerfile_path.exists():
        raise FileNotFoundError(f"dockerfile not found: {dockerfile_rel}")

    print(f"[module-install] docker build → {tag}", flush=True)
    image, build_logs = client.images.build(
        path=str(work_dir),
        dockerfile=str(dockerfile_path.relative_to(work_dir)),
        tag=tag,
        buildargs=build_args or {},
        rm=True,
        forcerm=True,
        pull=False,
    )
    for chunk in build_logs:
        msg = chunk.get("stream") or chunk.get("error")
        if msg:
            print(f"[module-build][{tag}] {msg.strip()}", flush=True)
    return image.tags[0] if image.tags else tag


def build_images(work_dir: Path, manifest: dict[str, Any], slug: str) -> tuple[str, str]:
    """Build both FE + BE images. Returns (fe_tag, be_tag)."""
    version = manifest.get("version", "0.0.0")

    fe_spec = manifest.get("frontend", {})
    be_spec = manifest.get("backend", {})

    fe_tag = f"grokflow-mod-{slug}-fe:{version}"
    be_tag = f"grokflow-mod-{slug}-be:{version}"

    fe_tag_built = _build_image(
        work_dir,
        fe_spec.get("dockerfile", "frontend/Dockerfile"),
        fe_tag,
        fe_spec.get("build_args"),
    )
    be_tag_built = _build_image(
        work_dir,
        be_spec.get("dockerfile", "backend/Dockerfile"),
        be_tag,
        be_spec.get("build_args"),
    )
    return fe_tag_built, be_tag_built


def _parse_mem(spec: str) -> int:
    """'512m' → bytes. '1g' → bytes. Returns bytes capped at HARD_CAP_MEM_BYTES."""
    spec = spec.strip().lower()
    if spec.endswith("g"):
        val = int(float(spec[:-1]) * 1024**3)
    elif spec.endswith("m"):
        val = int(float(spec[:-1]) * 1024**2)
    else:
        val = int(spec)
    return min(val, HARD_CAP_MEM_BYTES)


def _common_security_kwargs(manifest: dict[str, Any]) -> dict[str, Any]:
    """Hardened defaults applied to every module container. Manifest can
    request less but never more (we enforce the caps)."""
    res = manifest.get("resources", {})
    mem_bytes = _parse_mem(res.get("memory", "512m"))
    cpus = min(float(res.get("cpus", 0.5)), HARD_CAP_CPUS)
    return {
        "cap_drop": ["ALL"],
        "security_opt": ["no-new-privileges:true"],
        "read_only": True,
        "tmpfs": {"/tmp": "rw,size=128m"},
        "mem_limit": mem_bytes,
        "memswap_limit": mem_bytes,    # disallow swap
        "cpu_period": 100000,
        "cpu_quota": int(cpus * 100000),
        "pids_limit": 200,
        "network": MODULE_NETWORK,
        "restart_policy": {"Name": "unless-stopped"},
    }


def spawn_backend(slug: str, manifest: dict[str, Any], be_tag: str,
                  db_user: str, db_password: str, db_schema: str,
                  service_token: str) -> str:
    """Run the module's BE image. Returns container id.

    Critical env vars the module's BE code can rely on:
      MODULE_DB_URL              postgres DSN scoped to the module's schema
      GROKFLOW_API_URL           where to call back into core /api/sdk/*
      GROKFLOW_SERVICE_TOKEN     module's identity to core
      MODULE_SLUG                module's own slug
    """
    name = f"grokflow-mod-{slug}-be"
    _remove_if_exists(name)

    from app.core.config import settings
    url, db_name = _admin_dsn()
    parsed = urlparse(url)
    # Replace credentials in the DSN with the module's restricted user.
    module_dsn = (
        f"postgresql://{db_user}:{db_password}"
        f"@{parsed.hostname}:{parsed.port or 5432}/{db_name}"
        f"?options=-csearch_path%3D{db_schema}"
    )

    container = _docker().containers.run(
        be_tag,
        name=name,
        detach=True,
        environment={
            "MODULE_DB_URL": module_dsn,
            "GROKFLOW_API_URL": "http://backend:8000/api/sdk",
            "GROKFLOW_SERVICE_TOKEN": service_token,
            "MODULE_SLUG": slug,
        },
        labels={"grokflow.module": slug, "grokflow.kind": "module-be"},
        **_common_security_kwargs(manifest),
    )
    return container.id


def spawn_frontend(slug: str, manifest: dict[str, Any], fe_tag: str) -> str:
    """Run the module's FE image."""
    name = f"grokflow-mod-{slug}-fe"
    _remove_if_exists(name)

    container = _docker().containers.run(
        fe_tag,
        name=name,
        detach=True,
        labels={"grokflow.module": slug, "grokflow.kind": "module-fe"},
        **_common_security_kwargs(manifest),
    )
    return container.id


def _remove_if_exists(name: str) -> None:
    """Best-effort `docker rm -f <name>`. Used before spawning so a stale
    container with the same name doesn't 409-conflict the new run."""
    with contextlib.suppress(Exception):
        c = _docker().containers.get(name)
        with contextlib.suppress(Exception):
            c.stop(timeout=3)
        with contextlib.suppress(Exception):
            c.remove(force=True)


def stop_containers(slug: str) -> None:
    """Stop + remove both FE and BE containers for the slug."""
    for kind in ("fe", "be"):
        _remove_if_exists(f"grokflow-mod-{slug}-{kind}")


def get_logs(slug: str, kind: str = "be", tail: int = 200) -> str:
    """Return the last `tail` log lines from a module container.

    `kind` is one of 'fe' / 'be' — UI defaults to 'be' since that's where
    most crashes show up. Returns an empty string if the container isn't
    running (uninstalled, never spawned, etc.) instead of raising — the
    admin UI handles the empty state gracefully.
    """
    name = f"grokflow-mod-{slug}-{kind}"
    try:
        container = _docker().containers.get(name)
    except Exception:
        return ""
    try:
        raw = container.logs(tail=tail, timestamps=False)
        return raw.decode("utf-8", errors="replace") if isinstance(raw, bytes) else str(raw)
    except Exception as exc:  # noqa: BLE001
        return f"[error reading logs: {exc}]"


def get_status(slug: str) -> dict[str, Any]:
    """Inspect both containers + return a compact runtime snapshot for the
    admin UI: state, started_at, restart count, last health probe."""
    out: dict[str, Any] = {}
    for kind in ("fe", "be"):
        name = f"grokflow-mod-{slug}-{kind}"
        try:
            c = _docker().containers.get(name)
            c.reload()
            state = c.attrs.get("State", {}) or {}
            out[kind] = {
                "status": state.get("Status"),
                "started_at": state.get("StartedAt"),
                "restart_count": c.attrs.get("RestartCount"),
                "health": (state.get("Health") or {}).get("Status"),
            }
        except Exception:
            out[kind] = None
    return out


# ─── Health probe ──────────────────────────────────────────────────────


async def wait_healthy(slug: str, manifest: dict[str, Any],
                       timeout_sec: int = 90) -> bool:
    """Poll the module's BE /health (via docker network DNS) until it
    returns 200 or we hit the timeout. Used after spawn to detect
    boot-time crashes before declaring success."""
    health_path = manifest.get("backend", {}).get("health_path", "/health")
    backend_url = f"http://grokflow-mod-{slug}-be:8000{health_path}"

    deadline = time.monotonic() + timeout_sec
    async with httpx.AsyncClient(timeout=3.0) as client:
        while time.monotonic() < deadline:
            try:
                r = await client.get(backend_url)
                if r.status_code == 200:
                    return True
            except Exception:
                pass
            await asyncio.sleep(1.0)
    return False


# ─── nginx vhost ──────────────────────────────────────────────────────


def write_vhost(slug: str) -> bool:
    """Drop an nginx server block routing /m/<slug>/* to the FE container
    and /m/<slug>/api/* to the BE container.

    Returns True on write, False when the host vhost dir isn't mounted
    (typical for local dev — the iframe still loads via the dev proxy).
    """
    if not VHOSTS_DIR.exists() or not os.access(VHOSTS_DIR, os.W_OK):
        return False

    fe_host = f"grokflow-mod-{slug}-fe"
    be_host = f"grokflow-mod-{slug}-be"
    out = VHOSTS_DIR / f"grokflow-mod-{slug}.conf"
    out.write_text(
        f"""# Auto-generated by GrokFlow module marketplace — do not edit.
# Routes /m/{slug}/* to the module containers spawned by admin_modules.installer.

location ^~ /m/{slug}/api/ {{
    proxy_pass http://{be_host}:8000/;
    proxy_http_version 1.1;
    proxy_set_header Host              $host;
    proxy_set_header X-Real-IP         $remote_addr;
    proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_read_timeout 86400s;
    proxy_send_timeout 86400s;
    proxy_buffering off;
}}

location ^~ /m/{slug}/ {{
    proxy_pass http://{fe_host}:80/;
    proxy_http_version 1.1;
    proxy_set_header Host              $host;
    proxy_set_header X-Real-IP         $remote_addr;
    proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header Upgrade           $http_upgrade;
    proxy_set_header Connection        "upgrade";
}}
""",
        encoding="utf-8",
    )
    return True


def remove_vhost(slug: str) -> None:
    out = VHOSTS_DIR / f"grokflow-mod-{slug}.conf"
    with contextlib.suppress(Exception):
        out.unlink(missing_ok=True)
