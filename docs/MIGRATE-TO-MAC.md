# Migrate GrokFlow VPS → Mac (M1)

Step-by-step runbook để chuyển toàn bộ stack từ VPS Linux sang Mac M1 8GB
24/7. Cảnh báo ngay: **8GB RAM sát trần** — toàn bộ tuning trong runbook
này nhằm fit container trong ~4GB Docker VM. Để dư phòng và an toàn dài
hạn cân nhắc Mac mini M2/M4 16GB.

> **Quick mental model** — 4 thứ cần migrate:
> 1. **Code** — `git clone`, vào branch `homepage` hoặc `prod`.
> 2. **Secrets** — `.env.prod` (password manager).
> 3. **Data** — Postgres DB + storage volume + browser_profiles (5 profile × ~200 MB).
> 4. **Networking** — Cloudflare tunnel → DNS cutover.

---

## ⏱ Tổng thời gian: 30-60 phút

- Backup VPS (nếu chưa lên Drive): 5-10 phút
- Cài Docker Desktop + brew tools trên Mac: 10 phút (lần đầu)
- Clone + build images trên Mac: 10-20 phút (ARM64 native build)
- Restore data: 5-10 phút
- Tunnel + DNS cutover: 5 phút

---

## Section 1 — Chuẩn bị trên VPS (5 phút)

Đảm bảo backup mới nhất đã sync lên Google Drive:

```bash
ssh vpsroot@192.168.1.16
cd /home/vpsroot/grokflow
sudo bash ./scripts/backup.sh
sudo bash ./scripts/backup-health.sh   # phải trả "OK"
```

Lấy 2 thông tin quan trọng từ password manager (đã setup từ trước):
- `RESTIC_PASSWORD`
- Google Drive folder ID (`1Ypxf2J6g4gDix2Igo2iapqY_wcqfJbkK`)
- TUNNEL_TOKEN của Cloudflare Tunnel (xem `dash.cloudflare.com → Zero Trust → Tunnels`)

---

## Section 2 — Cài tools trên Mac (10 phút lần đầu)

### 2.1 Docker Desktop

Tải: https://www.docker.com/products/docker-desktop/ (chọn bản Apple Silicon).

Sau khi cài, vào **Settings → Resources**:
- **Memory**: 5 GB (mặc định 2GB không đủ)
- **CPUs**: 6 (M1 có 8 core, để dành 2 cho macOS)
- **Disk**: 60 GB (Postgres + storage + Chromium volumes ~30GB peak)

### 2.2 Homebrew tools

```bash
# Cài Homebrew nếu chưa có
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Tools cần
brew install git rclone restic cloudflared python@3.12
```

### 2.3 Re-OAuth rclone với Google Drive

Token rclone không chuyển được qua máy mới, cần auth lại:

```bash
rclone authorize drive
# → Browser mở, sign in vào account Google đã có folder backup
# → Token JSON in ra terminal — copy nguyên cụm
```

Tạo `~/.config/rclone/rclone.conf`:

```bash
mkdir -p ~/.config/rclone
cat > ~/.config/rclone/rclone.conf <<'EOF'
[gdrive]
type = drive
scope = drive
token = {"access_token":"PASTE_TOKEN_JSON_HERE","refresh_token":"...","expiry":"..."}
root_folder_id = 1Ypxf2J6g4gDix2Igo2iapqY_wcqfJbkK
EOF
chmod 600 ~/.config/rclone/rclone.conf
```

Test:
```bash
rclone lsd gdrive:    # phải thấy folder grokflow-restic
```

---

## Section 3 — Clone + restore trên Mac (15-25 phút)

### 3.1 Clone repo

```bash
mkdir -p ~/Projects
cd ~/Projects
git clone https://github.com/nguyenlehai-dev/GrokFlow.git grokflow
cd grokflow
git checkout homepage   # hoặc prod nếu bạn đã merge
```

### 3.2 Backup-env

```bash
cat > .backup-env <<'EOF'
export RESTIC_REPOSITORY="rclone:gdrive:grokflow-restic"
export RESTIC_PASSWORD="<paste from password manager>"
export RCLONE_CONFIG="$HOME/.config/rclone/rclone.conf"
EOF
chmod 600 .backup-env
```

### 3.3 Tạo `.env.prod` cho Mac

Copy template + chỉnh giảm để fit 8GB RAM:

```bash
cp .env.prod.example .env.prod
```

Quan trọng — chỉnh các giá trị sau (mở `.env.prod` bằng editor):

```env
# Domains: giữ nguyên domain công khai
DOMAIN=flowgrok.vpspanel.io.vn
PUBLIC_API_URL=https://flowgrok.vpspanel.io.vn

# Postgres: giữ password GIỐNG HỆT VPS (để restore không lệch)
POSTGRES_USER=grokflow
POSTGRES_PASSWORD=<paste từ .env.prod VPS — restore sẽ fail nếu khác>
POSTGRES_DB=grokflow

# Secrets: copy nguyên xi từ .env.prod VPS
JWT_SECRET=<paste>
ENCRYPTION_KEY=<paste>

# Mac-specific resource tuning
APP_ENV=production
APP_DEBUG=false

# Concurrency thấp hơn VPS (M1 8GB không có RAM cho nhiều worker)
MAX_CONCURRENT_JOBS_PER_USER=2
MAX_CONCURRENT_JOBS_PER_PROFILE=1
WORKER_MAX_IN_FLIGHT=3
FLOW_MAX_CONCURRENT=1
GUNICORN_WORKERS=2

# Grok retry tuning (đã chứng minh tốt trên prod)
JOB_BACKOFF_SECONDS=60,300,900
JOB_RATE_LIMIT_BACKOFF=300,900,1800

CORS_ORIGINS=https://flowgrok.vpspanel.io.vn

TAG=latest
```

### 3.4 Tạo `docker-compose.mac.yml` override (đã có sẵn, xem cuối doc)

### 3.5 Bring up Postgres + Redis trước

```bash
docker compose --env-file .env.prod \
  -f docker-compose.intranet.yml \
  -f docker-compose.mac.yml \
  up -d postgres redis

sleep 15
```

### 3.6 Restore data từ Drive

```bash
chmod +x scripts/*.sh
./scripts/restore.sh latest --profiles
```

Quá trình này (5-10 phút):
- pg_restore vào Postgres
- Untar storage_data vào volume
- Untar browser_profiles vào `./browser_profiles/`
- Tạo lại nginx vhost dirs (Mac không dùng nhưng để consistency)

### 3.7 Build + bring up phần còn lại

```bash
docker compose --env-file .env.prod \
  -f docker-compose.intranet.yml \
  -f docker-compose.mac.yml \
  build --pull backend frontend

docker compose --env-file .env.prod \
  -f docker-compose.intranet.yml \
  -f docker-compose.mac.yml \
  up -d

sleep 30

# Apply alembic migrations
docker exec grokflow-backend-1 alembic upgrade head

# Smoke test
curl http://localhost:5173/
curl http://localhost:8000/health
```

---

## Section 4 — Networking: Cloudflare Tunnel (5 phút)

### 4.1 Chạy cloudflared trên Mac

Option A — **Docker container** (gọn, dễ manage cùng compose):

Thêm vào `docker-compose.mac.yml` (đã có sẵn):

```yaml
cloudflared:
  image: cloudflare/cloudflared:latest
  restart: unless-stopped
  command: tunnel --no-autoupdate run
  environment:
    TUNNEL_TOKEN: ${CLOUDFLARE_TUNNEL_TOKEN}
  depends_on:
    - frontend
```

Trong `.env.prod`:
```env
CLOUDFLARE_TUNNEL_TOKEN=<paste từ Cloudflare dashboard>
```

Option B — **launchd service** (chạy native, không qua Docker):

```bash
brew install cloudflared
cloudflared service install <TUNNEL_TOKEN>
# Mac sẽ tự khởi động cloudflared mỗi khi boot
```

### 4.2 Update DNS hosting target trên Cloudflare

Vào `dash.cloudflare.com → Networks → Tunnels → flowgrok tunnel → Public Hostname`:

- **Service**: `http://localhost:5173` (FE nginx serve port)
- Không cần đổi domain (`flowgrok.vpspanel.io.vn`)

Cloudflare tunnel tự route public traffic về Mac (qua tunnel TCP outbound).

---

## Section 5 — DNS cutover + verify (5 phút)

### 5.1 Test Mac trước khi cắt VPS

Curl từ máy khác (không phải Mac đang chạy):

```bash
curl -I https://flowgrok.vpspanel.io.vn/
# → HTTP 200, header `Server: cloudflare`
```

Kiểm tra Cloudflare tunnel dashboard — phải thấy 2 connector active (VPS + Mac).

### 5.2 Stop VPS containers (không xoá data)

```bash
ssh vpsroot@192.168.1.16
cd /home/vpsroot/grokflow
sudo docker compose --env-file .env.prod -f docker-compose.intranet.yml down
```

Cloudflare tunnel sẽ tự loại bỏ connector VPS sau ~1-2 phút (no heartbeat).
Toàn bộ traffic giờ đi Mac.

### 5.3 Verify lần cuối

```bash
# Từ máy khác
curl https://flowgrok.vpspanel.io.vn/api/health
# → {"status":"ok",...}

# Login → mở /grok/jobs → tạo 1 job test
# Phải success (vì profile cookies đã restore từ VPS)
```

### 5.4 Sau 24h ổn định — decommission VPS

```bash
ssh vpsroot@192.168.1.16
sudo docker compose --env-file .env.prod -f docker-compose.intranet.yml down -v
sudo rm -rf /home/vpsroot/grokflow   # cẩn thận: xoá data luôn
```

Hoặc giữ VPS làm backup standby — chỉ tắt power không xoá. Trả VPS provider nếu hết hạn.

---

## Lưu ý vận hành sau migrate

### Mac sleep / lock screen

macOS mặc định sleep sau idle → containers ngừng chạy → tunnel chết.
Phòng chống:

```bash
# Ngăn sleep khi đóng nắp (cho Mac mini không có nắp thì skip)
sudo pmset -a sleep 0 disablesleep 1

# Hoặc dùng caffeinate khi cần (tạm thời)
caffeinate -di &
```

### Backup cron (làm lại trên Mac)

VPS chạy backup mỗi 15 phút qua systemd timer. Mac dùng launchd:

```bash
mkdir -p ~/Library/LaunchAgents
cat > ~/Library/LaunchAgents/com.grokflow.backup.plist <<'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>com.grokflow.backup</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>/Users/YOUR_USER/Projects/grokflow/scripts/backup.sh</string>
  </array>
  <key>StartInterval</key><integer>900</integer>
  <key>StandardOutPath</key><string>/tmp/grokflow-backup.log</string>
  <key>StandardErrorPath</key><string>/tmp/grokflow-backup.err</string>
</dict>
</plist>
EOF
launchctl load ~/Library/LaunchAgents/com.grokflow.backup.plist
```

### Resource monitor

Mở Activity Monitor → tab Memory → tìm "Docker" — phải dưới 5GB.

Nếu vượt:
- Giảm `WORKER_MAX_IN_FLIGHT` từ 3 → 2
- Giảm `GUNICORN_WORKERS` từ 2 → 1
- Dừng VNC profiles không dùng

### Rollback nếu Mac không kham được

DNS chưa cutover → tunnel tự loại Mac connector → trở lại VPS instantly.
Nếu đã decommission VPS:
1. Khôi phục VPS bằng `./scripts/restore.sh latest --profiles` (lấy backup mới nhất trên Drive)
2. Mất tối đa 15 phút data (interval backup) cộng với thời gian restore.

---

## Section 6 — Troubleshooting

| Triệu chứng | Nguyên nhân | Fix |
|---|---|---|
| `docker compose up` báo OOM Mac | Memory limit Docker Desktop quá thấp | Settings → Resources → Memory ≥ 5GB |
| Postgres restore fail "FATAL: password authentication" | `.env.prod` password khác VPS | Copy nguyên xi POSTGRES_PASSWORD |
| Cloudflare tunnel không kết nối | Token sai hoặc Mac không có internet | Test `curl https://1.1.1.1`; tạo tunnel mới nếu cần |
| Chromium trong VNC bị đen | Singleton lock file (đã fix trong `vnc/entrypoint.sh`) | `docker compose restart grokflow-vnc-*` |
| Flow video upload báo 413 | Mac upload speed slow + nginx timeout | Tăng `client_max_body_size` đã có 600m, OK |
| Job stuck queued forever | `WORKER_MAX_IN_FLIGHT` quá thấp + queue dài | Tăng tạm `WORKER_MAX_IN_FLIGHT=5` trong `.env.prod`, restart worker |

---

## docker-compose.mac.yml (template — đã có sẵn ở root repo)

Override các cap memory cho phù hợp Mac M1 8GB. Tham chiếu đoạn này khi cần chỉnh:

```yaml
# Generated for Mac M1 8GB. Override default container caps.
services:
  postgres:
    command:
      - postgres
      - -c
      - shared_buffers=128MB         # was 512MB
      - -c
      - effective_cache_size=384MB   # was 1GB
      - -c
      - max_connections=40
    deploy:
      resources:
        limits: { memory: 768M }     # was 2G

  redis:
    command: ["redis-server", "--appendonly", "yes", "--maxmemory", "128mb"]
    deploy:
      resources:
        limits: { memory: 192M }

  backend:
    deploy:
      resources:
        limits: { memory: 1G }        # was 1.5G

  worker:
    deploy:
      resources:
        limits: { memory: 384M }      # was 512M

  idle-cleanup:
    deploy:
      resources:
        limits: { memory: 128M }      # was 192M

  cloudflared:
    image: cloudflare/cloudflared:latest
    restart: unless-stopped
    command: tunnel --no-autoupdate run
    environment:
      TUNNEL_TOKEN: ${CLOUDFLARE_TUNNEL_TOKEN}
    depends_on:
      - frontend
```

Tổng RAM cap: 0.77 + 0.19 + 1 + 0.38 + 0.13 + 0.05 (cloudflared) + 0.13 (frontend) = **~2.7 GB** containers + Docker VM overhead ~1.5 GB = **~4.2 GB** cho Docker → dư ~4 GB cho macOS + apps.
