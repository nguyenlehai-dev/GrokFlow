# Troubleshooting — Bug đã gặp + cách fix

Tổng hợp tất cả lỗi đã gặp trong quá trình build pipeline. Khi vendor
hoặc khách gặp lỗi tương tự, đối chiếu ở đây.

## Phía VENDOR — khi chạy `export_product.py`

### Push bị reject — non-fast-forward

```
 ! [rejected]   HEAD -> main (fetch first)
```

**Nguyên nhân**: Repo khách có commit (vd: README mặc định khi tạo repo).

**Fix**: Pipeline mặc định đã dùng `--force`. Nếu vẫn fail → có ai đang
push song song với bạn, hoặc PAT thiếu quyền. Check PAT scope:
`Contents: Write`.

### `! missing: <path>`

```
-> copying backend (55 paths)
  ! missing: app/modules/grok/something
```

**Nguyên nhân**: Path trong `manifest.include.backend` không có thật.

**Fix**: Sửa đường dẫn hoặc xóa khỏi `include`. Pipeline sẽ tiếp tục
(không fail).

### `- patch noop: <file>`

```
  - patch noop: backend/app/models/auth.py
```

**Nguyên nhân**: Patch's `find` / `regex_find` không khớp file content.
Có thể vì:
- Pattern sai
- File đã được patch (idempotent)
- Monorepo canonical đã đổi → pattern out of date

**Fix**: Mở file canonical trong monorepo (`backend/app/models/auth.py`),
copy đoạn chính xác cần patch vào `find:`. Hoặc dùng `regex_find:` với
DOTALL nếu pattern xuyên dòng.

### Unicode error trên Windows console

```
UnicodeEncodeError: 'charmap' codec can't encode character '↳'
```

**Nguyên nhân**: cp1252 không có ký tự fancy `↳` `·`.

**Fix**: Đã thay bằng ASCII `+` `-` trong `export_product.py`. Nếu thêm
log mới → tránh ký tự non-ASCII.

### YAML literal block không match indent

```
- file: backend/app/foo.py
  find: |
    line1
    line2
```

**Nguyên nhân**: `|` block giữ literal nhưng leading whitespace của
content phải khớp với leading của file. File có 4 spaces indent →
content trong YAML cần có 4 spaces.

**Fix**: Dùng `regex_find:` thay (regex match flexible hơn) hoặc
override file đầy đủ.

## Phía CUSTOMER — khi chạy stack

### BE container restart loop

```bash
docker compose ps
# backend: Restarting (3) 5 seconds ago
```

**Diagnose**:
```bash
docker compose logs backend --tail=80
```

Tìm `Traceback` đầu tiên.

#### Common: `ImportError: cannot import name 'FlowJob' from 'app.models'`

**Nguyên nhân**: Code (vd: dashboard router) import `FlowJob` nhưng
product không có model đó.

**Fix vendor side**: Add patch trong manifest. Vd với flowgrok:
```yaml
patches:
  - file: backend/app/modules/admin/gallery/router.py
    find: "from app.models import Domain, FlowJob, Job, Profile, User"
    replace: "from app.models import Domain, Job, Profile, User\nFlowJob = None  # type: ignore[assignment]"
```

Sau đó re-export + khách re-pull.

#### `relation "plans" does not exist`

**Nguyên nhân**: Boot trước khi alembic chạy. App `seed_default_plans`
ở lifespan, nhưng bảng `plans` chưa được tạo.

**Fix**: Chạy migration **trước** restart backend:
```bash
docker compose stop backend
docker compose run --rm --entrypoint "" backend alembic upgrade head
docker compose up -d backend
```

`customer_setup.sh` và `customer_update.sh` đã làm thứ tự này — nếu
gặp lỗi, có thể bạn đã `docker compose up -d` thủ công trước migration.

#### `Fernet key must be 32 url-safe base64-encoded bytes`

**Nguyên nhân**: `.env` thiếu hoặc sai `ENCRYPTION_KEY`.

**Fix**: Generate đúng format:
```bash
python3 -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
```
Cập nhật `.env`:
```bash
ENCRYPTION_KEY=<32-byte-base64-string>
```

#### `(trapped) error reading bcrypt version`

Cảnh báo passlib 1.7 + bcrypt 4.x. Không phải lỗi — hash vẫn được tạo
đúng. Bỏ qua.

#### SQLAlchemy: `expression 'Profile' failed to locate a name`

**Nguyên nhân**: `User` model có relationship đến `Profile` nhưng product
không có Profile model (vd: ai-gateway).

**Fix vendor side**: Patch `User` model bỏ relationship:
```yaml
patches:
  - file: backend/app/models/auth.py
    regex_find: '    profiles: Mapped\[list\["Profile"\]\].*?\n    jobs: Mapped\[list\["Job"\]\].*?\n'
    regex_replace: '    # ai-gateway: User has no Grok profiles/jobs\n'
```

### FE container restart loop

```bash
docker compose logs frontend --tail=30
```

#### `host not found in upstream "host.docker.internal"`

**Nguyên nhân**: nginx vhost trong FE container reference
`host.docker.internal:8001` (ai-gateway sibling backend) — không tồn tại
trên Linux.

**Fix vendor side**: Đã có patch trong tất cả 3 manifest:
```yaml
- file: frontend/nginx.conf
  regex_find: '    # gatewaygrok-backend reverse proxy.*?location /gateway-api/ \{.*?\n    \}\n'
  regex_replace: ''
```

Nếu vẫn gặp → check FE image build cache. Force rebuild:
```bash
docker compose build --no-cache frontend
docker compose up -d frontend
```

#### `host not found in upstream "backend"`

**Nguyên nhân**: nginx resolve `backend` hostname tại startup time, fail
nếu backend container chưa lên.

**Fix**: nginx.conf đã có `set $backend "http://backend:8000"; proxy_pass $backend;` (lazy DNS). Nếu file dạng cũ hardcode → patch.

### Frontend build fail (TS errors)

```
src/modules/grok/views/CreateVideoProPage.tsx — Cannot find module
```

**Nguyên nhân**: Code FE còn reference page đã bị drop.

**Fix vendor side**: Add patches strip những route đã drop:
```yaml
- file: frontend/src/app/router.tsx
  regex_find: '\{\n\s*path: "/create-video-pro",.*?errorElement: <RouteErrorBoundary />,\s*\},'
  regex_replace: ''
```

### Dashboard / Stats endpoint 500

Test:
```bash
curl -H "Authorization: Bearer $TOKEN" http://localhost:8000/api/dashboard/admin
```

Lỗi `AttributeError: 'NoneType' object has no attribute 'X'`:

**Nguyên nhân**: Model được stub `= None` nhưng code body vẫn gọi attr
(vd: `GwVendor.name` khi `GwVendor = None`).

**Fix vendor side**: Stub block sử dụng model thành `= []`:
```yaml
- file: backend/app/modules/admin/dashboard/router.py
  regex_find: '    # -+ Gateway LLM.*?gw_items = \[.*?\]'
  regex_replace: '    gw_items: list[AppItem] = []  # Gateway dropped'
```

### `customer_update.sh` báo "already up to date" nhưng container code cũ

**Nguyên nhân**: `git reset --hard origin/main` đã làm trước script
chạy (vendor đã reset), nên script nghĩ không có gì để update.

**Fix**: Force rebuild thủ công lần này:
```bash
docker compose down
docker compose up -d --build
docker compose run --rm --entrypoint "" backend alembic upgrade head
docker compose restart backend
```

Lần sau, đừng `git reset --hard` thủ công — chỉ chạy `customer_update.sh`.

### Login trả `user_not_found`

```json
{"detail": {"code": "user_not_found", "message": "..."}}
```

**Nguyên nhân**: Email không tồn tại trong DB.

**Fix**: Tạo user qua script:
```bash
docker compose exec -T backend python -m app.scripts.create_admin \
  --email admin@your-domain.com \
  --password 'YourStrongPass123!' \
  --role super_admin
```

### Login trả `invalid_password`

Đổi password vì quên:
```bash
docker compose exec -T postgres psql \
  -U $(grep POSTGRES_USER .env | cut -d= -f2) \
  -d $(grep POSTGRES_DB .env | cut -d= -f2) \
  -c "DELETE FROM users WHERE email='admin@your-domain.com';"

docker compose exec -T backend python -m app.scripts.create_admin \
  --email admin@your-domain.com \
  --password 'NewPass123!' \
  --role super_admin
```

### Tất cả "Restarting" sau docker compose up

```bash
docker compose ps
# all services Restarting
```

**Diagnose** — postgres healthcheck fail thường là root cause:
```bash
docker compose logs postgres --tail=20
```

Common: volume permissions issue. Wipe + retry:
```bash
docker compose down -v   # !!! XÓA DATA
docker compose up -d --build
docker compose run --rm --entrypoint "" backend alembic upgrade head
```

(`-v` xóa volume → mất data. Backup trước nếu là production.)

### Disk full

```bash
df -h
# Filesystem on / 95%
```

**Cleanup**:
```bash
docker system prune -af --volumes    # !!! xóa cả unused volume
# hoặc nhẹ hơn:
docker image prune -af
docker container prune -f
```

### Out of memory — container OOM kill

```bash
docker compose ps
# backend: Exited (137)
```

**Diagnose**:
```bash
docker stats --no-stream
free -h
```

Backend Chromium dùng 500MB-1GB/profile. Nếu khách chạy nhiều profile
song song → đầy RAM. Giảm `GUNICORN_WORKERS` trong `.env` (4→2→1) hoặc
upgrade VPS.

## Phía CẢ HAI — git / network

### `git push` slow (5+ phút)

Đường mạng VN ↔ GitHub đôi khi chậm. Push 700 KB mất 5 phút.

**Workaround**: Push qua proxy / VPN nếu có. Hoặc chấp nhận.

### PAT đã hết hạn

```
fatal: Authentication failed for 'https://github.com/...'
```

**Fix**:
1. https://github.com/settings/tokens → tạo PAT mới
2. Update `.env` hoặc env var `$GITHUB_PAT`
3. Vendor: re-export
4. Customer: `git remote set-url origin https://...:NEWPAT@github.com/...`

### `permission denied (publickey)` khi SSH

```bash
ssh customer-vps
# Permission denied
```

**Fix vendor side**: copy SSH key:
```bash
ssh-copy-id appuser@customer-vps
```

(Cần khách cấp quyền sudo trên VPS trước.)

## Log location reference

| Cái gì | Đâu |
|--------|-----|
| Backend Python log | `docker compose logs backend` |
| Worker (Job queue) log | `docker compose logs worker` |
| Frontend nginx log | `docker compose logs frontend` |
| Postgres slow query | `docker compose logs postgres` |
| Customer update cron | `/var/log/<product>-update.log` |
| Host nginx access | `/var/log/nginx/access.log` |
| Host nginx error | `/var/log/nginx/error.log` |
| Cloudflare WARP | `journalctl -u warp-svc -f` |
| Certbot renewal | `journalctl -u snap.certbot.renew.service` |

## Emergency contacts

- Bug khách báo qua GitHub Issues trên repo product
- Bug khẩn cấp: ssh access (nếu vendor được cấp quyền) + Telegram/Zalo trực tiếp
- Security disclosure: `security@plxeditor.com` (privately, đợi 30 ngày trước khi public)
