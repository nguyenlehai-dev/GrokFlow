# Flow video tools — setup runbook

The Flow menu (Cut / Merge / Extract audio / Add audio / Speed / Resize /
Crop / Extract frames) runs as a native module inside the GrokFlow backend.

```
Browser ─▶ frontend(nginx) ─▶ backend (FastAPI + FFmpeg)
                                     │
                                     ├─▶ Postgres `flow_jobs` table
                                     └─▶ storage/flow/{input,output}/
```

No side-car container, no separate database, no separate auth surface — the
module mirrors the FE structure (`frontend/src/modules/flow/`) and reuses
GrokFlow's existing JWT + Postgres + storage volume.

## Files that ship the feature

| Path | Purpose |
|---|---|
| [backend/app/modules/flow/router.py](../backend/app/modules/flow/router.py) | HTTP surface `/api/flow/*` — upload, run, list, retry, download, health. |
| [backend/app/modules/flow/service.py](../backend/app/modules/flow/service.py) | Per-tool FFmpeg recipes + the shared job-lifecycle wrapper. |
| [backend/app/modules/flow/ffmpeg.py](../backend/app/modules/flow/ffmpeg.py) | Subprocess shim around `ffmpeg` / `ffprobe`. |
| [backend/app/modules/flow/schemas.py](../backend/app/modules/flow/schemas.py) | Pydantic DTOs. |
| [backend/app/models/__init__.py](../backend/app/models/__init__.py) | `FlowJob` SQLAlchemy model. |
| [backend/alembic/versions/0011_flow_jobs.py](../backend/alembic/versions/0011_flow_jobs.py) | DDL migration. |
| [frontend/src/modules/flow/](../frontend/src/modules/flow/) | FE side — tools registry, workspace page, API docs page. |
| [backend/Dockerfile.prod](../backend/Dockerfile.prod) | Adds `ffmpeg` to the apt-get install line. |

## First-time setup (VPS)

```bash
cd /home/vpsroot/grokflow
git pull
docker compose --env-file .env.prod -f docker-compose.intranet.yml \
  build --pull backend frontend
docker compose --env-file .env.prod -f docker-compose.intranet.yml \
  up -d backend frontend
docker exec grokflow-backend-1 alembic upgrade head
```

Smoke-test:

```bash
docker exec grokflow-backend-1 ffmpeg -version | head -1
docker exec grokflow-backend-1 sh -lc 'ls /app/storage/flow || mkdir -p /app/storage/flow/{input,output}'
curl -s http://localhost:8000/health
```

Open `https://flowgrok.vpspanel.io.vn/flow/cut` and run a short clip.

## API surface (mirrors the FE shape)

| Method | Endpoint | Notes |
|---|---|---|
| POST | `/api/flow/upload` | multipart files + `tool_name` → `job_id` |
| POST | `/api/flow/upload-url` | 501 (URL bypass was R2-only — removed) |
| POST | `/api/flow/run/{tool}` | form fields per tool, kicks off BackgroundTask |
| GET | `/api/flow/jobs/{id}` | polled every 2 s by the FE |
| GET | `/api/flow/jobs` | paginated list of the caller's jobs |
| POST | `/api/flow/jobs/{id}/retry` | replays a failed/completed job |
| GET | `/api/flow/download/{filename}` | streams output bytes (aliased via nginx `/flow-output/`) |
| GET | `/api/flow/health` | `{status: "healthy", backend: "native"}` |

## Storage

```
/app/storage/flow/
  ├─ input/<job_id>/<filename>
  └─ output/<job_id>/<job_id>_<operation>.<ext>
```

- The `<job_id>_<...>` prefix on output filenames is what `download/{name}`
  uses to reject path traversal — files outside `output/<id-prefix>/` are
  unreachable by URL.
- Inputs are auto-deleted once a job completes. To preserve them for retry
  without re-upload, comment the `shutil.rmtree(input_dir(...))` call near
  the bottom of `service._process()`.

## Adding a new tool

1. Append a `ToolDef` entry in `frontend/src/modules/flow/tools.ts` (slug,
   icon, fields, drop-zone shape).
2. Add the slug to `KNOWN_TOOLS` in `backend/app/modules/flow/router.py`.
3. Write a `process_<slug>(...)` function in `service.py` — the existing
   ones are 10-20 lines each.
4. Wire it into `_spawn_task()` in `router.py`.

No new model, no new migration, no FE plumbing changes.

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Upload returns 413 | nginx `client_max_body_size` < file | Bump in `frontend/nginx.conf` (currently 600m). |
| Job stuck at `processing` forever | FFmpeg timeout (10 min) | Split input into smaller chunks. Tweak `FFMPEG_TIMEOUT_S` in `ffmpeg.py` if needed. |
| Job `failed` "input file missing" | Input dir wiped (volume reset) | Re-upload — input files are cleaned after each successful run. |
| Output 404 at `/flow-output/...` | Filename doesn't match `<job_id>_*` shape | Check `download/{filename}` log — should be the FE's `output_url` value verbatim. |

## Resource expectations

For the 2 vCPU / 8 GB / 40 GB NVMe VPS:

- One concurrent 1080p encode: ~600-800 MB RAM, one full vCPU.
- 2 concurrent encodes is the safe ceiling (backend container is capped at
  1.5 GB; gunicorn worker count caps how many tasks can spawn).
- Storage: budget ~3 GB temp + 5-10 GB output retention. Prune with:
  ```bash
  docker exec grokflow-backend-1 \
    find /app/storage/flow/output -mtime +14 -delete
  ```

## What was removed

The previous implementation used a separate `flow-api` container vendored
from [`nguyenlehai-dev/video-processing-service`](https://github.com/nguyenlehai-dev/video-processing-service).
That's been retired:

- `flow-api/` folder deleted.
- `flow-api` service + `flow_api_data` volume removed from
  `docker-compose.intranet.yml`.
- `FLOW_BOOTSTRAP_*` and `FLOW_R2_*` env vars are no-ops now.
- `/api/flow/upload-url` returns 501 (the URL bypass was R2-specific).

Migration steps if upgrading from the side-car deploy:

```bash
docker compose --env-file .env.prod -f docker-compose.intranet.yml \
  stop flow-api
docker compose --env-file .env.prod -f docker-compose.intranet.yml \
  rm -f flow-api
docker volume rm grokflow_flow_api_data   # only after you confirm no
                                          # in-flight jobs you still care about
docker compose --env-file .env.prod -f docker-compose.intranet.yml \
  build --pull backend
docker compose --env-file .env.prod -f docker-compose.intranet.yml \
  up -d backend
docker exec grokflow-backend-1 alembic upgrade head
```
