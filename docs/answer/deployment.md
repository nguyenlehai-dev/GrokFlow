# Deployment

Hướng dẫn deploy GrokFlow lên VPS Linux (Ubuntu/Debian) bằng Docker Compose + Caddy auto-TLS.

## Yêu cầu

| Item | Tối thiểu | Khuyến nghị |
|---|---|---|
| RAM | 2 GB | 4 GB+ (nếu chạy worker thật với Chrome) |
| CPU | 1 vCPU | 2+ vCPU |
| Disk | 20 GB | 50 GB+ (storage tăng theo job) |
| OS | Ubuntu 22.04 LTS | Ubuntu 24.04 LTS |
| Domain | 1 (vd `app.example.com`) | 2 (vd `app.example.com` + `api.example.com`) |
| Ports mở | 22, 80, 443 | + worker outbound |

DNS: trỏ A record của cả `DOMAIN` và `API_DOMAIN` về IP server **trước khi deploy** — Caddy sẽ thất bại issue TLS nếu DNS chưa propagate.

## 1. Bootstrap server

SSH vào VPS rồi chạy script bootstrap (cài Docker + UFW):

```bash
curl -fsSL https://raw.githubusercontent.com/<your-org>/GrokFlow/main/deploy/bootstrap.sh | bash
# log out & log back in để docker group có hiệu lực
```

Hoặc thủ công:

```bash
sudo apt-get update
sudo apt-get install -y curl ufw
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER
sudo ufw allow 22,80,443/tcp
sudo ufw enable
```

## 2. Clone repo + cấu hình

```bash
sudo mkdir -p /opt/grokflow && sudo chown $USER /opt/grokflow
cd /opt/grokflow
git clone https://github.com/<your-org>/GrokFlow.git .
git checkout main

cp .env.prod.example .env.prod
nano .env.prod
```

Bắt buộc đổi:

| Biến | Cách lấy |
|---|---|
| `DOMAIN` | `app.example.com` |
| `API_DOMAIN` | `api.example.com` |
| `CADDY_EMAIL` | email thật (Let's Encrypt notify) |
| `PUBLIC_API_URL` | `https://api.example.com` |
| `POSTGRES_PASSWORD` | `openssl rand -hex 24` |
| `JWT_SECRET` | `python3 -c "import secrets; print(secrets.token_hex(32))"` |
| `ENCRYPTION_KEY` | `python3 -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"` |
| `CORS_ORIGINS` | `https://app.example.com` |

> **Quan trọng**: `ENCRYPTION_KEY` không được rotate sau khi đã có cookie/session profile mã hóa trong DB — sẽ hỏng toàn bộ profile. Sinh 1 lần, backup vào secret manager (1Password/Vault).

## 3. Build + start

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

Quan sát log Caddy issue TLS:

```bash
docker compose -f docker-compose.prod.yml logs -f caddy
```

Khi thấy `certificate obtained successfully` cho cả 2 domain là OK.

## 4. Migration + seed admin

```bash
docker compose -f docker-compose.prod.yml exec backend alembic upgrade head

docker compose -f docker-compose.prod.yml exec backend \
  python -m app.scripts.create_admin \
    --email admin@example.com \
    --password "$(openssl rand -base64 18)"
```

Lưu password mới được sinh — đăng nhập rồi đổi ngay (Phase 4 sẽ có UI đổi password; tạm dùng API trực tiếp).

## 5. Verify

```bash
curl https://app.example.com/        # → HTML index của SPA
curl https://api.example.com/health  # → {"status":"ok",...}
curl https://api.example.com/docs    # → Swagger UI
```

Browse `https://app.example.com` → login với admin.

## 6. Cron daily reset

Trên server thêm crontab user-level:

```bash
crontab -e
```

```
0 0 * * * cd /opt/grokflow && docker compose -f docker-compose.prod.yml exec -T backend python -m app.workers.daily_reset >> /var/log/grokflow-reset.log 2>&1
```

## 7. Update / redeploy

```bash
cd /opt/grokflow
bash deploy/deploy.sh
```

Script sẽ: pull → build → migrate → recreate services → prune.

Để pin version (rollback an toàn):

```bash
TAG=v0.2.0 BRANCH=v0.2.0 bash deploy/deploy.sh
```

## 8. Backup

### Postgres

Cron daily backup vào local + offsite:

```bash
mkdir -p /opt/grokflow/backups
crontab -e
```

```
30 2 * * * docker compose -f /opt/grokflow/docker-compose.prod.yml exec -T postgres pg_dump -U grokflow grokflow | gzip > /opt/grokflow/backups/db_$(date +\%F).sql.gz
0 3 * * * find /opt/grokflow/backups -name 'db_*.sql.gz' -mtime +14 -delete
```

Push lên S3/B2:

```
30 4 * * * aws s3 sync /opt/grokflow/backups s3://your-bucket/grokflow/
```

### File storage

Volume `storage_data` chứa kết quả job. Backup tương tự:

```bash
docker run --rm -v grokflow_storage_data:/data -v /opt/grokflow/backups:/backup alpine \
  tar czf /backup/storage_$(date +%F).tar.gz -C /data .
```

## 9. Monitoring (gợi ý Phase 4)

| Concern | Tool |
|---|---|
| Container health | `docker compose ps`, healthchecks đã built-in |
| App errors | Sentry SDK trong FastAPI + frontend |
| Metrics | Prometheus + Grafana hoặc OTel → Grafana Cloud |
| Uptime | UptimeRobot/BetterStack ping `https://api.example.com/health` |
| Log aggregation | Loki / Logtail / Papertrail (parse JSON từ stdout) |

## 10. Scale-out

- **Worker**: tăng số lượng `worker` instance bằng `docker compose -f docker-compose.prod.yml up -d --scale worker=4`. Lưu ý: 1 profile chỉ chạy 1 job tại 1 thời điểm — đảm bảo bằng status lock trong DB.
- **Backend API**: nhân bản backend container, đặt sau Caddy load-balanced (Caddy `reverse_proxy backend:8000 backend2:8000 ...`).
- **Postgres**: chuyển sang managed service (RDS/Neon/Supabase) khi >100 GB hoặc cần HA.
- **Storage**: chuyển sang S3/R2 khi >100 GB. Set `STORAGE_DRIVER=s3` + AWS creds.

## 11. Troubleshooting

| Triệu chứng | Nguyên nhân thường gặp | Fix |
|---|---|---|
| Caddy log `failed to obtain cert` | DNS chưa trỏ đúng IP | Đợi DNS propagate, retry sau 5 phút. Tạm bật ACME staging trong Caddyfile để test. |
| `connection refused` đến postgres | DB chưa healthy | `docker compose logs postgres` — check disk space, password mismatch. |
| Frontend trắng trang sau deploy | `VITE_API_BASE_URL` build sai | Sửa `.env.prod`, rebuild frontend (`docker compose build frontend && docker compose up -d frontend`). |
| 401 trên dashboard sau update | `JWT_SECRET` thay đổi | Nếu cố ý: tất cả user login lại. Nếu vô tình: rollback secret. |
| Worker pick job nhưng không complete | Provider stub chưa thay bằng real flow | Phase 3 — implement Playwright. Hiện tại stub sẽ trả success. |

## 12. Tách subdomain hay 1 domain?

| Option | Pros | Cons |
|---|---|---|
| 2 subdomains (FE + API riêng) | CORS sạch, public API có rate-limit/IP allowlist riêng (Phase 4) | Cần 2 DNS records |
| 1 domain, API path `/api`, `/v1` | 1 cert, đơn giản | Khó tách rate limit, frontend share cookie domain với API |

Mặc định stack này dùng option 1. Để chuyển option 2: sửa `Caddyfile` bỏ block `{$API_DOMAIN}` và `PUBLIC_API_URL=https://app.example.com` trong `.env.prod`.

## 13. Alternative platforms (PaaS)

Nếu không muốn quản lý VPS:

| Platform | Phù hợp |
|---|---|
| **Railway** | Connect repo → tự build + deploy. Có Postgres + Redis managed. ~$5/tháng/service. |
| **Render** | Tương tự Railway. Free tier có sẵn cho hobby. |
| **Fly.io** | Multi-region, cần config `fly.toml` cho mỗi service. |
| **Coolify** (self-host) | UI giống Heroku, chạy trên VPS của bạn. |

Mỗi nền tảng cần adapt: bỏ `caddy` service (PaaS có TLS sẵn), đặt env trên dashboard, expose port 8000 (backend) và 80 (frontend).
