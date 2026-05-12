# Flow video tools — setup runbook

The Flow menu (Cut / Merge / Extract audio / Resize / …) is powered by a
vendored copy of
[`nguyenlehai-dev/video-processing-service`](https://github.com/nguyenlehai-dev/video-processing-service),
deployed as the `flow-api` Docker service alongside the rest of the stack.

```
Browser ─▶ frontend(nginx) ─▶ backend ─▶ flow-api ─▶ FFmpeg
                                 │            │
                                 │            └─▶ /app/data/{input,output}
                                 └─ injects X-API-Key from shared volume
```

## What ships in this repo

| Path | Purpose |
|---|---|
| `flow-api/Dockerfile` | Builds the side-car image. `git clone`s upstream at build time. |
| `flow-api/sidecar.py` | Monkey-patches upstream to support local-filesystem input (no R2 needed). Adds `/api/v1/video/jobs/init-local`. |
| `flow-api/bootstrap.py` | First-boot: creates admin user + API key, writes key to `/app/data/.api-key`. |
| `flow-api/entrypoint.sh` | Runs bootstrap then `uvicorn sidecar:app`. |
| `backend/app/modules/flow/router.py` | Thin proxy under `/api/flow/*` — hides X-API-Key from the browser and tags jobs with the GrokFlow user id. |
| `frontend/src/modules/flow/` | UI: one declarative tool registry + one shared page component. |

## First-time setup (VPS)

1. Fill in the new env vars (see [`.env.prod.example`](../.env.prod.example) — the
   `FLOW_*` block):

   ```env
   FLOW_SECRET_KEY=<openssl rand -hex 32>
   FLOW_BOOTSTRAP_EMAIL=flow-admin@grokflow.local
   FLOW_BOOTSTRAP_USERNAME=flowadmin
   FLOW_BOOTSTRAP_PASSWORD=<openssl rand -hex 16>
   FLOW_MAX_UPLOAD_MB=500
   ```

   Leave the `FLOW_R2_*` block empty unless you want output served from
   Cloudflare R2 (local mode is fine for VPS-only deploys; outputs are
   served via nginx at `/flow-output/<filename>`).

2. Pull the latest code on the VPS and (re)build:

   ```bash
   cd /home/vpsroot/grokflow
   git pull
   docker compose --env-file .env.prod -f docker-compose.intranet.yml up -d --build flow-api backend frontend
   ```

   The first build pulls FFmpeg + clones upstream — expect 2–4 minutes.

3. Verify bootstrap completed:

   ```bash
   docker exec grokflow-flow-api-1 cat /app/data/.api-key | head -c 20
   docker logs grokflow-flow-api-1 --tail 30 | grep bootstrap
   ```

4. Open `https://flowgrok.vpspanel.io.vn/flow/cut` and try a small clip.

## Storage backends

### Local (default)

- Input files land at `/app/data/input/<job_id>/<filename>` inside the
  `flow_api_data` Docker volume.
- Output files land at `/app/data/output/<operation>_<short>.mp4`.
- Public download URL: `https://your-domain/flow-output/<file>` — served by
  nginx (`location /flow-output/` in `frontend/nginx.conf`).
- Quota: bounded by the VPS disk. Run `docker exec grokflow-flow-api-1 du -sh /app/data` to inspect.

### Cloudflare R2 (optional)

Set the `FLOW_R2_*` block in `.env.prod` and restart `flow-api`. The
sidecar detects R2 mode and falls back to upstream's presigned-URL upload
flow — direct from browser to R2, no extra server bandwidth.

Bucket policy: allow `PutObject` from R2 access key only; expose a
public-read sub-path or a Cloudflare Worker for download URLs.

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `503 flow_api_unavailable` from `/api/flow/*` | Bootstrap key missing | `docker logs grokflow-flow-api-1 \| grep bootstrap`. If user already exists from a prior run, manually fetch the key from the DB and put it into `FLOW_API_KEY` env on the backend. |
| Upload returns 413 | `client_max_body_size` lower than the file | Bump in `frontend/nginx.conf` and `FLOW_MAX_UPLOAD_MB`. |
| Job stuck at `processing` forever | FFmpeg timeout (10 min hardcoded upstream) | Split input into smaller chunks; long-form rendering is not the design goal here. |
| Job `failed` with "Local input not found" | Container restart wiped the `flow_api_data` volume | Verify the named volume in compose; never `docker compose down -v` in production. |
| Output 404 at `/flow-output/...` | nginx isn't proxying to flow-api | Reload nginx config: `docker exec grokflow-frontend-1 nginx -s reload`. |

## Resource expectations

For the spec being discussed (2 vCPU / 8 GB / 40 GB NVMe):

- Idle: ~150 MB RAM for flow-api (FastAPI + SQLite).
- Per active job (cut/resize 1080p): ~400–700 MB RAM during ffmpeg, one
  full CPU core. So 2 concurrent jobs ≈ full CPU + 1.5 GB RAM.
- Storage: budget ~3 GB temp + 5–10 GB persistent output history before
  you start pruning. Run `docker exec grokflow-flow-api-1 sh -c 'find /app/data/output -mtime +14 -delete'` as a weekly cron.

## Future work

- Real per-user ownership table (`flow_jobs(grokflow_user_id, flow_api_job_id)`)
  for strict multi-tenant isolation. Today the proxy tags `params._owner`
  but the underlying flow-api row is owned by the shared admin user.
- Webhook notification when a job completes — flow-api has no callback
  hook today; the FE just polls every 2 s.
- Migrate the SQLite to a small Postgres schema so the FE can list "all my
  videos" across browser sessions.
