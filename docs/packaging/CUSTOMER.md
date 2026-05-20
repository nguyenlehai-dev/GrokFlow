# Customer — Hướng dẫn cho khách hàng

Bạn vừa nhận được link repo private trên GitHub. Doc này hướng dẫn cài
sản phẩm lên VPS của bạn + cập nhật khi vendor (PLX Editor) ship version
mới.

## Yêu cầu server

**Khuyến nghị: Linux VPS** (Ubuntu 22.04 / Debian 12).

| Tài nguyên | Tối thiểu | Khuyến nghị |
|------------|-----------|-------------|
| vCPU | 2 | 4 |
| RAM | 4 GB | 8 GB |
| Disk | 30 GB | 60 GB |
| OS | Ubuntu 22.04+ | Ubuntu 22.04 LTS |
| Network | 1 IP public + 1 domain trỏ về | TLS qua Let's Encrypt sẽ tự cấp |

Nếu bạn **bắt buộc dùng Windows Server**: cài WSL2 + Ubuntu 22.04 rồi
làm theo phần Linux phía dưới ở bên trong WSL.

## Cài đặt lần đầu

### Bước 1: Cài Docker + Git trên VPS

```bash
ssh root@your-vps-ip
apt-get update
apt-get install -y docker.io docker-compose-plugin git curl openssl python3-cryptography
systemctl enable --now docker

# Tạo user non-root chạy app (khuyến nghị)
adduser --disabled-password --gecos "" appuser
usermod -aG docker appuser
su - appuser
```

### Bước 2: Clone repo product

Vendor đã gửi bạn:
- Repo URL: `https://github.com/nt7310063-boop/<product>.git`
- Personal Access Token (PAT) bắt đầu bằng `github_pat_...` hoặc `ghp_...`

```bash
cd /opt
sudo mkdir <product> && sudo chown $USER <product>
cd /opt
git clone https://<github-username>:<PAT>@github.com/nt7310063-boop/<product>.git
cd <product>
```

Thay `<github-username>` bằng tên GitHub của bạn, `<PAT>` bằng token.

> **Lưu ý security**: PAT có trong URL → được lưu trong
> `/opt/<product>/.git/config`. Đảm bảo file đó chỉ `appuser` đọc được:
> `chmod 600 .git/config`.

### Bước 3: Chạy script setup

```bash
bash _scripts/customer_setup.sh
```

Script sẽ:
- Kiểm tra docker, git, ram, disk
- Hỏi domain (vd: `editor.cong-ty-ban.com`) hoặc IP
- Hỏi ports (mặc định BE 8000, FE 5173)
- Tự sinh `POSTGRES_PASSWORD`, `JWT_SECRET`, `ENCRYPTION_KEY` ngẫu
  nhiên + ghi vào `.env`
- Build + run docker compose (lần đầu mất 5–15 phút vì pull Chromium)
- Chạy alembic migrations
- Hỏi email + password admin → tạo super_admin user
- In ra URL truy cập

Sau khi xong, mở browser:
- `http://<domain>:<FE_port>/` (vd `http://editor.cong-ty-ban.com:5173/`)
- Login với email + password vừa tạo

### Bước 4 (tuỳ chọn): TLS + domain với host nginx

Nếu bạn có domain thật, đặt TLS:

```bash
sudo bash deploy/install_nginx.sh editor.cong-ty-ban.com admin@cong-ty-ban.com
```

Script này:
- Cài nginx + certbot nếu chưa có
- Tạo vhost nginx proxy về docker compose
- Xin cert Let's Encrypt
- Auto-redirect HTTP → HTTPS

Sau đó truy cập `https://editor.cong-ty-ban.com/` (port 443) thay vì IP:5173.

### Bước 5 (chỉ cho product có Grok / VNC): bật WARP + watchdog

flowgrok / plxeditor-studio có Chromium VNC. Để Cloudflare không chặn:

```bash
sudo bash deploy/install_warp_proxy.sh
sudo bash deploy/install_warp_watchdog.sh
sudo bash deploy/install_nginx_watcher.sh
sudo bash deploy/install_watcher_keepalive.sh
```

Mỗi script chỉ chạy 1 lần. Sau đó systemd lo phần còn lại.

## Cập nhật khi vendor ship version mới

### Cách 1: Thủ công

```bash
cd /opt/<product>
bash _scripts/customer_update.sh
```

Script tự:
- `git pull` từ repo
- Nếu không có commit mới → exit (no-op)
- Nếu có → `docker compose up -d --build`
- Chạy alembic migrations mới
- Restart backend
- Smoke-test BE healthy

### Cách 2: Auto-update mỗi đêm (khuyến nghị)

Thêm cron:
```bash
sudo crontab -e
```

Thêm dòng:
```cron
0 3 * * * cd /opt/<product> && bash _scripts/customer_update.sh \
         >> /var/log/<product>-update.log 2>&1
```

3 giờ sáng mỗi ngày, cron tự pull + rebuild. Nếu vendor push 9h sáng,
6h tối server bạn đã có version mới.

Xem log: `tail -f /var/log/<product>-update.log`

## Operations hàng ngày

### Xem trạng thái

```bash
cd /opt/<product>
docker compose ps
```

Tất cả service phải `Up ... (healthy)`. Nếu có service `Restarting` →
xem log.

### Xem log

```bash
# Tất cả
docker compose logs --tail=50

# 1 service cụ thể
docker compose logs backend --tail=80
docker compose logs frontend --tail=20

# Live tail
docker compose logs -f backend
```

### Restart

```bash
docker compose restart                    # tất cả
docker compose restart backend            # 1 service
```

### Dừng + bật lại

```bash
docker compose stop                       # dừng (giữ data)
docker compose start                      # bật lại
```

### Backup database

```bash
docker compose exec -T postgres pg_dump -U $(grep POSTGRES_USER .env | cut -d= -f2) \
  $(grep POSTGRES_DB .env | cut -d= -f2) | gzip > backup-$(date +%Y%m%d).sql.gz
```

Copy file `backup-*.sql.gz` về máy local hoặc S3.

### Restore database

```bash
gunzip < backup-20260520.sql.gz | docker compose exec -T postgres \
  psql -U $(grep POSTGRES_USER .env | cut -d= -f2) $(grep POSTGRES_DB .env | cut -d= -f2)
```

## Bảo mật

1. **Đổi password admin** ngay sau lần login đầu tiên (Settings → My
   Profile → Change Password)
2. **PAT GitHub** nên có expires 1 năm và scope tối thiểu (Contents:
   Read-only)
3. **`.env` chứa secrets** — chỉ user chạy app đọc được (`chmod 600 .env`)
4. **Update OS thường xuyên**: `sudo apt update && sudo apt upgrade -y`
5. **Firewall**: chỉ mở port 80/443 ra ngoài; chặn 5173/8000/<các port>
   bên trong (chỉ nginx proxy chạm)
6. **Backup hàng ngày** + lưu offsite

## Liên hệ support

- Vendor: PLX Editor
- Email security disclosures: security@plxeditor.com (private trước khi public)
- Bug report: GitHub Issues trên repo product
- Khẩn cấp: ssh access (nếu vendor đã được cấp quyền) hoặc liên hệ trực tiếp
