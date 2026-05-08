# Deploy folder

Production deployment artifacts. Đọc full guide ở [`docs/answer/deployment.md`](../docs/answer/deployment.md).

| File | Mục đích |
|---|---|
| [`Caddyfile`](./Caddyfile) | Reverse proxy + auto TLS (Let's Encrypt) cho `DOMAIN` + `API_DOMAIN` |
| [`bootstrap.sh`](./bootstrap.sh) | Setup VPS lần đầu: install Docker, UFW, tạo `/opt/grokflow` |
| [`deploy.sh`](./deploy.sh) | Pull → build → migrate → restart. Chạy trên server hoặc qua GitHub Actions |

Compose file dùng cho production: [`../docker-compose.prod.yml`](../docker-compose.prod.yml).

Env template: [`../.env.prod.example`](../.env.prod.example).

## Lệnh nhanh

```bash
# Lần đầu trên server
bash deploy/bootstrap.sh

# Mỗi lần update
bash deploy/deploy.sh

# Pin version
TAG=v0.2.0 BRANCH=v0.2.0 bash deploy/deploy.sh

# Tail logs
docker compose -f docker-compose.prod.yml logs -f --tail=100

# Restart 1 service
docker compose -f docker-compose.prod.yml restart backend

# Stop everything (giữ data)
docker compose -f docker-compose.prod.yml down

# Wipe (xoá cả data — cẩn thận)
docker compose -f docker-compose.prod.yml down -v
```

## GitHub Actions secrets cần set

Trong `Settings → Secrets and variables → Actions` của repo:

| Secret | Value |
|---|---|
| `SSH_HOST` | IP hoặc hostname VPS |
| `SSH_USER` | user có quyền sudo + trong group `docker` |
| `SSH_PRIVATE_KEY` | nội dung file `~/.ssh/id_ed25519` (private key) |
| `HEALTH_URL` | `api.example.com` (smoke check sau deploy) |

Tạo Environment riêng cho `staging` và `prod` để có review gate trước khi deploy prod.
