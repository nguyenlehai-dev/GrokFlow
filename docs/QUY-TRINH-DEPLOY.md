# Quy trình code & deploy — hướng dẫn vận hành

Tài liệu này dành cho **người vận hành** (bạn). Đọc xong làm theo từng dòng
là chạy được. Chi tiết kỹ thuật xem [`BRANCHING.md`](BRANCHING.md).

---

## TL;DR

```
git push origin staging  →  ~60s sau https://test.nexoratech.com.vn live (đã test)
git push origin prod     →  ~60s sau https://flow.nexoratech.com.vn live (thật)
```

Build/health fail trên server → **tự động rollback** về commit trước.
Bạn không cần SSH, không cần script — chỉ `git push`.

---

## 1. Sơ đồ luồng

```
                                              ┌──────────────────────────────┐
local code  ─push→  origin/dev  ──PR──→  origin/staging  ──cron(60s)──→  test.nexoratech.com.vn
                                                                         (env=staging, DB riêng)
                                              │                          │
                                              │                          ↓ test OK?
                                              │                          │
                                              ↓ PR                       ↓
                                          origin/prod  ─cron(60s)→  flow.nexoratech.com.vn
                                                                    (env=production, LIVE)
```

| Nhánh | Mục đích | Auto-deploy? | Domain |
|---|---|---|---|
| `dev` | Code hằng ngày, có thể bể | ❌ chỉ chạy CI | (không) |
| `staging` | Test trước prod | ✅ cron mỗi 60s | https://test.nexoratech.com.vn |
| `prod` | Live website | ✅ cron mỗi 60s | https://flow.nexoratech.com.vn |

---

## 2. Quy trình hằng ngày — single dev

### A. Setup máy mới (1 lần)

```bash
git clone https://github.com/nguyenlehai-dev/GrokFlow.git
cd GrokFlow
git checkout dev
```

### B. Code → commit → push lên dev

```bash
git checkout dev
git pull origin dev          # đồng bộ với máy khác

# … sửa code …

git add -A
git commit -m "feat(...): mô tả ngắn"     # hoặc fix:/ops:/docs:/refactor:
git push origin dev
```

CI trên GitHub sẽ tự chạy `pytest` + `npm run build`. Đợi check xanh trên
PR trước khi merge.

### C. Đẩy lên staging để test

```bash
git checkout staging
git pull --ff-only origin staging
git merge --ff-only dev        # đem code dev sang staging
git push origin staging
```

→ ~60s sau, https://test.nexoratech.com.vn có code mới.

### D. Mở https://test.nexoratech.com.vn

- **Trình duyệt sẽ hỏi user/pass** (HTTP basic auth gate trước nginx):
  - User: `staging`
  - Pass: lấy từ password manager (kêu admin cấp)
- Sau đó vào màn login app, dùng tài khoản admin staging (cũng từ
  password manager).
- Test thoải mái — DB staging riêng hoàn toàn, không động prod.

### E. Test OK → merge sang prod

```bash
git checkout prod
git pull --ff-only origin prod
git merge --ff-only staging    # FF merge, history sạch
git push origin prod
```

→ ~60s sau, https://flow.nexoratech.com.vn (cùng domain prod khác) có
code mới. **Đây là live thật, người dùng thấy ngay.**

### F. Lỡ tay đẩy commit hỏng?

Yên tâm — server tự rollback nếu backend không khởi động hoặc `/health`
không xanh sau 90 giây (xem section **Auto-rollback** bên dưới).

---

## 3. Hai môi trường khác nhau thế nào?

| | Prod | Staging |
|---|---|---|
| Branch | `prod` | `staging` |
| Domain | flow.nexoratech.com.vn | **test.nexoratech.com.vn** |
| Repo dir trên VPS | `/home/vpsroot/grokflow` | `/home/vpsroot/grokflow-staging` |
| Containers | `grokflow-*` | `grokflow-staging-*` |
| Database (Postgres) | `grokflow` | `grokflow_staging` (instance riêng) |
| Secrets (JWT, encryption key) | `.env.prod` | `.env.staging` (ngẫu nhiên hoàn toàn khác) |
| Host port backend / frontend | 8000 / 5173 | 18000 / 15173 |
| Deploy log | `/home/vpsroot/grokflow-deploy.log` | `/home/vpsroot/grokflow-deploy-staging.log` |
| HTTP basic auth ngoài app | Không | **Có** (chặn người ngoài) |
| Cron entry | mỗi 60s | mỗi 60s (lock riêng) |

Hai stack chạy song song trên cùng VPS, không bao giờ đụng nhau.

---

## 4. Auto-rollback — khi build/health fail

### Cơ chế

Mỗi tick deploy:

1. Lưu commit hiện tại vào `.last-good-commit`
2. `git reset --hard` về commit mới + rebuild service đã đổi
3. Chạy alembic migration
4. **Poll `backend:/health` qua docker network**, tối đa 90 giây
5. Nếu không trả `{"status":"ok"}` → coi như fail
6. → `git reset --hard <commit cũ>` + rebuild lại
7. Webhook báo (nếu có) → 4 sự kiện: started / succeeded / **failed** / **rolled-back**

### Tham số (đặt trong `.env.prod` hoặc `.env.staging`)

```bash
HEALTH_TIMEOUT_SEC=90      # max thời gian chờ health (default 90s)
ROLLBACK_ON_FAIL=true      # đặt false để giữ commit broken (debug)
DEPLOY_WEBHOOK_URL=        # Discord/Slack webhook (optional)
```

### Khi bạn muốn debug 1 commit broken trên staging

```bash
ssh vpsroot@192.168.1.11
sed -i 's|^ROLLBACK_ON_FAIL=.*|ROLLBACK_ON_FAIL=false|' /home/vpsroot/grokflow-staging/.env.staging
# Push lại commit cần debug
# Cron sẽ deploy + giữ nguyên dù health fail → SSH vào xem log container
```

Nhớ bật lại `true` khi xong.

---

## 5. Rollback thủ công (khi auto-rollback chưa đủ)

```bash
git checkout prod
git revert <bad-sha>           # cách an toàn: tạo commit revert mới
git push origin prod
# → ~60s sau VPS pull commit revert, deploy lại

# Hoặc reset cứng (chỉ khi chưa ai khác fetch):
git reset --hard <good-sha>
git push --force-with-lease origin prod
```

---

## 6. Theo dõi deploy

### Cách 1: Tail log từ máy bạn

```bash
ssh vpsroot@192.168.1.11 'tail -f ~/grokflow-deploy.log'
ssh vpsroot@192.168.1.11 'tail -f ~/grokflow-deploy-staging.log'
```

### Cách 2: GitHub Actions

- Vào tab **Actions** của repo → workflow **Deploy** → xem commit vừa push
- Workflow này không SSH, chỉ:
  1. Log commit/author vào audit trail
  2. Đợi 90s rồi `curl /health` từ ngoài (nếu set secret `HEALTH_URL_PROD` / `HEALTH_URL_STAGING`)

### Cách 3: Discord/Slack webhook (khuyến nghị)

Discord channel → Edit Channel → **Integrations → Webhooks → New Webhook → Copy URL**, rồi:

```bash
ssh vpsroot@192.168.1.11
echo 'DEPLOY_WEBHOOK_URL=https://discord.com/api/webhooks/<id>/<token>' >> ~/grokflow/.env.prod
echo 'DEPLOY_WEBHOOK_URL=https://discord.com/api/webhooks/<id>/<token>' >> ~/grokflow-staging/.env.staging
```

Sau đó mọi deploy sẽ ping channel với 4 loại sự kiện:
- 🚀 Deploy started
- ✅ Deploy succeeded (kèm commit + disk %)
- ⚠️ Deploy failed — rolling back
- ↩️ Rollback complete
- ❌ Deploy failed (no rollback) — nếu `ROLLBACK_ON_FAIL=false`

---

## 7. CI / GitHub Actions

| Workflow | Trigger | Việc làm |
|---|---|---|
| `ci.yml` | Push `dev`, PR vào bất kỳ branch | Backend `pytest`, frontend `tsc -b && npm run build` |
| `deploy.yml` | Push `staging` hoặc `prod` | Audit-only — log commit, smoke `/health` nếu có secret |

CI **không** deploy — auto-deploy do cron trên VPS quản. CI chỉ chặn merge
khi test/build fail.

---

## 8. Khắc phục sự cố

### Đẩy lên rồi mà site không lên?

```bash
# Xem log deploy gần nhất
ssh vpsroot@192.168.1.11 'tail -30 ~/grokflow-deploy.log'

# Hoặc staging:
ssh vpsroot@192.168.1.11 'tail -30 ~/grokflow-deploy-staging.log'
```

Tìm dòng `deploy done` (thành công) hoặc `DEPLOY FAILED` / `rollback complete`.

### Container không lên

```bash
ssh vpsroot@192.168.1.11
cd /home/vpsroot/grokflow      # hoặc /home/vpsroot/grokflow-staging
docker compose -f docker-compose.intranet.yml ps
docker compose -f docker-compose.intranet.yml logs backend --tail 100
```

### Cron không chạy?

```bash
ssh vpsroot@192.168.1.11 'crontab -l | grep auto_deploy; systemctl is-active cron'
```

Phải thấy 2 dòng `auto_deploy.sh prod` và `auto_deploy.sh staging`,
cron service `active`.

### Trigger deploy thủ công

```bash
ssh vpsroot@192.168.1.11
bash /home/vpsroot/grokflow/deploy/auto_deploy.sh prod
# Hoặc:
bash /home/vpsroot/grokflow-staging/deploy/auto_deploy.sh staging
```

### Disk full?

Script tự `docker prune` khi disk ≥ 90%. Nếu vẫn full:

```bash
ssh vpsroot@192.168.1.11
docker system prune -af --volumes
df -h /
```

---

## 9. Quản lý quyền truy cập staging (HTTP basic auth)

Staging có 1 lớp basic auth ngoài app login để chặn người ngoài.

**File:** `/etc/nginx/grokflow-vhosts/.htpasswd-staging`

### Thêm user mới

```bash
ssh vpsroot@192.168.1.11
NEW_HASH=$(openssl passwd -apr1)        # gõ pass, copy hash kết quả
echo "username:$NEW_HASH" | docker exec -i grokflow-staging-backend-1 \
  tee -a /host_nginx_vhosts/.htpasswd-staging
# inotify reloader sẽ tự reload nginx
```

### Xoá user

```bash
ssh vpsroot@192.168.1.11
docker exec grokflow-staging-backend-1 \
  sed -i '/^username:/d' /host_nginx_vhosts/.htpasswd-staging
```

### Đổi password user hiện có

Xoá rồi thêm lại.

### Bỏ basic auth (mở public)

Sửa `/etc/nginx/grokflow-vhosts/grokflow-test_nexoratech_com_vn.conf` —
xoá 2 dòng `auth_basic ...` ở đầu `server { ... }` block. Inotify reload
tự áp dụng.

---

## 10. Initial admin user

Mỗi env (staging/prod) cần ít nhất 1 super_admin để login vào app sau khi
DB khởi tạo lần đầu. Lệnh idempotent:

```bash
ssh vpsroot@192.168.1.11
docker exec \
  -e INITIAL_ADMIN_EMAIL=admin@yourdomain.com \
  -e INITIAL_ADMIN_PASSWORD='your_strong_password' \
  -e INITIAL_DOMAIN_LABEL='Staging' \
  grokflow-staging-backend-1 \
  python -m app.scripts.seed_first_run
```

Đổi `grokflow-staging-backend-1` → `grokflow-backend-1` nếu seed cho prod.
Re-run an toàn (chỉ tạo nếu chưa có).

---

## 11. Bootstrap staging mới từ đầu (one-time)

Khi VPS mới hoặc xoá staging dir và muốn dựng lại:

```bash
ssh vpsroot@192.168.1.11
sudo mkdir -p /home/vpsroot/grokflow-staging
sudo chown vpsroot: /home/vpsroot/grokflow-staging
cd /home/vpsroot/grokflow-staging
cp /home/vpsroot/grokflow/deploy/install_auto_deploy.sh .
bash install_auto_deploy.sh --branch staging

# Sửa .env.staging — đổi password, port, domain (xem .env.prod.example)
nano .env.staging

# Tạo nginx vhost trỏ test.<domain> → staging ports (xem BRANCHING.md)
# Thêm hostname vào Cloudflare Tunnel dashboard
# Seed admin (section 10)
```

---

## 12. Quy tắc commit message

Khớp style trong git log:

| Prefix | Khi nào dùng |
|---|---|
| `feat:` | Tính năng mới user thấy được |
| `fix:` | Sửa bug |
| `perf:` | Tối ưu hiệu năng |
| `ops:` | Hạ tầng / deploy / Docker / CI |
| `docs:` | Chỉ docs |
| `refactor:` | Restructure code, không đổi behavior |
| `test:` | Chỉ test |

Subject ≤ 70 ký tự. Giải thích **why** trong body nếu không hiển nhiên.

---

## Bảng tham chiếu nhanh

```bash
# Deploy code lên staging
git push origin staging

# Promote staging lên prod
git checkout prod && git merge --ff-only staging && git push origin prod

# Xem log deploy
ssh vpsroot@192.168.1.11 'tail -f ~/grokflow-deploy.log'

# Trigger deploy ngay (bypass cron)
ssh vpsroot@192.168.1.11 'bash ~/grokflow/deploy/auto_deploy.sh prod'

# Revert prod
git revert <bad-sha> && git push origin prod

# Tạm tắt rollback trên staging để debug
ssh vpsroot@192.168.1.11 \
  "sed -i 's/^ROLLBACK_ON_FAIL=.*/ROLLBACK_ON_FAIL=false/' ~/grokflow-staging/.env.staging"
```
