# Deploy với Cloudflare Tunnel

Phù hợp khi:

- Server là máy LAN (private IP) hoặc VPS không muốn mở port 80/443.
- Bạn có domain và đã add vào Cloudflare DNS.
- Bạn muốn TLS auto miễn phí + protection của Cloudflare (DDoS, WAF, bot management).

## 1. Tạo tunnel trong Cloudflare

1. Truy cập [Cloudflare Zero Trust](https://one.dash.cloudflare.com/) → chọn tài khoản → **Networks** → **Tunnels**.
2. Click **Create a tunnel** → chọn type **Cloudflared** → Next.
3. Đặt tên (vd `grokflow-prod`) → Save.
4. Trong tab **Install connector**, chọn **Docker** — sẽ thấy lệnh dạng:
   ```
   docker run cloudflare/cloudflared:latest tunnel --no-autoupdate run --token eyJh...rất dài...
   ```
   **Copy phần token** (chuỗi sau `--token`). Đây là `CLOUDFLARE_TUNNEL_TOKEN`.

5. Trong tab **Public Hostnames**, click **Add a public hostname**:

   | Hostname | Service |
   |---|---|
   | `flowgrok.vpspanel.io.vn` (domain của bạn) | `HTTP` `frontend:80` |

   Frontend nginx sẽ tự route `/api/`, `/v1/`, `/docs` → backend. Chỉ cần 1 hostname.
   Cloudflare tự tạo CNAME record nếu domain trên Cloudflare DNS, hoặc bạn add CNAME thủ công trỏ về `<tunnel-id>.cfargotunnel.com`.

6. Status tunnel sẽ là **Inactive** đến khi container `cloudflared` chạy và connect.

## 2. Deploy lên server

SSH vào server. Trên local Windows mở Git Bash hoặc PowerShell:

```bash
# Tạo archive (loại trừ data + secrets)
cd /d/MPV/Projects/GrokFlow

tar --exclude='./node_modules' \
    --exclude='./frontend/node_modules' \
    --exclude='./backend/__pycache__' \
    --exclude='./backend/.venv' \
    --exclude='./backend/storage' \
    --exclude='./backend/browser_profiles' \
    --exclude='./.git' \
    --exclude='./.claude' \
    --exclude='./.env*' \
    --exclude='./backend/.env' \
    --exclude='./frontend/.env' \
    -czf /tmp/grokflow.tgz .

# Upload (nhập password 1 lần)
scp /tmp/grokflow.tgz vpsroot@192.168.1.15:~/

# SSH (nhập password 1 lần nữa)
ssh vpsroot@192.168.1.15
```

Sau khi vào server:

```bash
mkdir -p ~/grokflow && cd ~/grokflow
tar -xzf ~/grokflow.tgz && rm ~/grokflow.tgz

# Chạy setup với mode cloudflare (1 domain duy nhất)
bash deploy/server-setup.sh cloudflare flowgrok.vpspanel.io.vn 'eyJh...PASTE_TOKEN_HERE...'
```

Script sẽ:

1. Sinh `.env.prod` với secrets ngẫu nhiên (Postgres password, JWT secret, Fernet key).
2. `docker compose -f docker-compose.cloudflare.yml up -d --build`.
3. Chờ backend healthy.
4. Seed admin user (`admin@local` + password ngẫu nhiên 12 ký tự — script sẽ in ra).

Output cuối cùng sẽ in URLs + admin credentials. **Copy lưu lại password admin** — không lưu plaintext sau khi tạo.

## 3. Verify

Mở browser:

- `https://flowgrok.vpspanel.io.vn` → login page.
- `https://flowgrok.vpspanel.io.vn/docs` → Swagger UI.
- `https://flowgrok.vpspanel.io.vn/health` → `{"status":"ok"}`.

Quan sát log tunnel:

```bash
docker compose -f docker-compose.cloudflare.yml logs -f cloudflared
```

Phải thấy `Connection registered` và `Updated to new configuration`.

## 4. Update / redeploy

Mỗi lần code thay đổi:

```bash
# Local: tạo tar mới + upload (như bước 2)
# Server:
cd ~/grokflow
tar -xzf ~/grokflow.tgz
bash deploy/server-setup.sh cloudflare flowgrok.vpspanel.io.vn '<TOKEN>'
```

`server-setup.sh` idempotent — sẽ giữ `.env.prod` cũ (giữ secrets), chỉ rebuild image + restart.

## 5. Bảo mật

- ⚠️ **Password SSH `123456789` quá yếu.** Đổi ngay sau deploy:
  ```bash
  passwd
  # Đặt password mới ≥16 ký tự
  ```
  Hoặc tốt hơn — setup SSH key:
  ```bash
  # Trên local
  ssh-keygen -t ed25519 -C "deploy@grokflow"
  ssh-copy-id vpsroot@192.168.1.15
  # Trên server, sửa /etc/ssh/sshd_config:
  #   PasswordAuthentication no
  sudo systemctl restart ssh
  ```

- Thêm **Cloudflare Access policy** cho `app.example.com` (Zero Trust → Access → Applications) để require email OTP / SSO trước khi vào dashboard. Public API `api.example.com` để raw cho khách dùng API key.

- Postgres + Redis **không expose port**. Chỉ accessible qua docker network nội bộ.

## 6. Troubleshooting

| Triệu chứng | Fix |
|---|---|
| Cloudflared log `failed to connect` | Sai token. Re-create tunnel, lấy token mới. |
| Browser truy cập domain báo `Error 1033 Argo Tunnel error` | Container `cloudflared` chưa up hoặc Public Hostname chưa add trong dashboard. |
| `502 Bad Gateway` | Backend/Frontend container chưa healthy. Check `docker compose ps` và logs. |
| Login thành công nhưng request sau đó lỗi CORS | `CORS_ORIGINS` trong `.env.prod` không match domain. Sửa và `docker compose restart backend`. |
| Admin password quên | Re-seed: `docker compose -f docker-compose.cloudflare.yml exec backend python -m app.scripts.create_admin --email admin@local --password NEW_PASS` (script là upsert). |

## 7. Rollback

```bash
cd ~/grokflow
docker compose -f docker-compose.cloudflare.yml down
git checkout <previous-commit>   # nếu dùng git
docker compose -f docker-compose.cloudflare.yml up -d --build
```

Hoặc giữ `TAG=v0.1.0` trong `.env.prod` rồi `docker compose pull && up -d` nếu push image lên registry.
