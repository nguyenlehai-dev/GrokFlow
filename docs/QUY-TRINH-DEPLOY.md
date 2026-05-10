# Quy trình code & deploy — hướng dẫn nhanh

Tài liệu này dành cho **người vận hành** (bạn). Đọc xong làm theo từng dòng
là chạy được. Tài liệu kỹ thuật chi tiết hơn xem
[`BRANCHING.md`](BRANCHING.md).

---

## Tóm tắt 1 dòng

```
git push origin prod  →  trong vòng ~30 giây, https://flowgrok.vpspanel.io.vn đã chạy code mới
```

---

## Hệ thống làm gì cho bạn

VPS có **1 cron job chạy mỗi phút**, kiểm tra GitHub xem nhánh `prod` có
commit mới không. Nếu có:

1. Pull code mới về VPS
2. Tự rebuild Docker container (chỉ rebuild phần đã đổi — backend/frontend)
3. Chạy database migration (nếu có)
4. Restart container
5. Dọn dẹp Docker cache cũ

Bạn KHÔNG cần SSH vào VPS. KHÔNG cần chạy script gì. Chỉ cần `git push`.

---

## 3 nhánh — biết để dùng đúng

| Nhánh | Dùng để | Push thoải mái không? |
|---|---|---|
| `dev` | Code hằng ngày, có thể bể | ✅ push thoải mái |
| `staging` | Test trước prod (tùy chọn) | ⚠ chỉ push khi cần test |
| `prod` | **Live website** | ❌ chỉ merge từ `dev` sau khi đã test xong |

---

## Quy trình hằng ngày (làm theo từng bước)

### A. Lần đầu setup máy mới (chỉ làm 1 lần)

```bash
# Clone repo về máy
git clone https://github.com/nguyenlehai-dev/GrokFlow.git
cd GrokFlow

# Chuyển sang nhánh dev (không bao giờ làm trực tiếp trên prod)
git checkout dev
git pull
```

### B. Sửa code

```bash
# Đảm bảo bạn đang ở nhánh dev
git checkout dev
git pull origin dev      # lấy commit mới nhất từ máy khác (nếu có)

# ... sửa code ...

# Commit
git add -A
git commit -m "feat: thêm tính năng X"
# Hoặc fix: ... / docs: ... / ops: ... / refactor: ...

# Push lên dev — ai cũng thấy được, nhưng CHƯA live
git push origin dev
```

→ GitHub Actions tự chạy CI (test + build). Đợi check xanh ✓ trước khi
qua bước C. Xem ở: https://github.com/nguyenlehai-dev/GrokFlow/actions

### C. Đẩy code lên website live (merge `dev` → `prod`)

Khi bạn ưng commit trên `dev` rồi và muốn nó chạy live:

```bash
# Lấy prod mới nhất về máy
git checkout prod
git pull --ff-only origin prod

# Merge dev vào (fast-forward — không tạo merge commit)
git merge --ff-only dev

# Push → kích hoạt auto-deploy
git push origin prod
```

→ **Trong vòng ~30-60 giây, website live đã update.**

Quay lại nhánh `dev` để tiếp tục code:
```bash
git checkout dev
```

### D. Theo dõi deploy đang chạy

Cách 1 — qua GitHub Actions (xem từ máy):
- Mở https://github.com/nguyenlehai-dev/GrokFlow/actions
- Workflow tên `Deploy` chạy sau mỗi push prod, có log thời gian

Cách 2 — qua log VPS (chi tiết hơn):
```bash
ssh vpsroot@192.168.1.15
tail -f /home/vpsroot/grokflow-deploy.log
```

Mỗi lần cron tick có commit mới sẽ thấy:
```
[2026-05-10T01:27:59+07:00] new commit on prod: a44e3dd → 7a3c382
[2026-05-10T01:28:01+07:00] rebuilding backend/worker/idle-cleanup
[2026-05-10T01:28:19+07:00] alembic upgrade head
[2026-05-10T01:28:25+07:00] post-deploy prune
[2026-05-10T01:28:27+07:00] deploy done. disk: 21%. live commit: 7a3c382
```

---

## Tình huống thường gặp

### Tôi push prod nhưng web vẫn chưa update

Đợi đủ 60 giây trước khi nghi ngờ (cron chạy mỗi phút). Sau 90s nếu vẫn chưa:

```bash
ssh vpsroot@192.168.1.15
cd /home/vpsroot/grokflow

# Kiểm tra nhánh hiện tại
git rev-parse --short HEAD
git rev-parse --short origin/prod

# Nếu hai khác nhau → cron không chạy. Chạy tay để debug:
bash deploy/auto_deploy.sh prod
```

Nếu chạy tay được nhưng cron không → kiểm tra:
```bash
crontab -l | grep auto_deploy   # đảm bảo có dòng cron
systemctl is-active cron        # phải là "active"
```

### Tôi merge nhầm code lỗi vào prod, làm sao revert?

```bash
git checkout prod
git pull
git revert <SHA-bị-lỗi>      # tạo commit revert
git push origin prod          # cron tự pull bản revert
```

Hoặc reset hẳn về commit tốt trước đó (chỉ làm khi không ai khác đã pull):
```bash
git reset --hard <SHA-tốt>
git push --force-with-lease origin prod
```

### Tôi đổi `.env.prod` trên VPS, có bị git ghi đè không?

KHÔNG. `.env.prod`, `browser_profiles/`, `storage/` đều nằm trong
`.gitignore`. Cron chỉ `git reset --hard` các file mà git tracking,
KHÔNG đụng tới các file ngoài. Bạn cứ sửa `.env.prod` trên VPS thoải mái.

### Đẩy nhiều commit cùng lúc lên prod có được không?

Có. Cron chỉ deploy 1 lần cho commit mới nhất. Nếu bạn push 5 commit liên
tiếp trong 30 giây, lần cron tick tiếp theo sẽ pull cả 5 và deploy 1 lần.

### CI trên GitHub fail thì sao?

CI chạy ở `.github/workflows/ci.yml`. Nếu fail:
- Trên `dev` → vẫn merge được, nhưng đừng (sửa lỗi trước)
- Trên `prod` → CI fail KHÔNG block deploy (cron VPS không kiểm CI). Tự
  chịu trách nhiệm: nếu test fail thì đừng merge lên prod.

Best practice: chỉ merge prod khi CI dev đã xanh ✓.

---

## Convention commit message

Theo [Conventional Commits](https://www.conventionalcommits.org/) — tiền tố chuẩn:

| Prefix | Khi nào dùng |
|---|---|
| `feat:` | Tính năng mới user thấy được |
| `fix:` | Sửa bug |
| `perf:` | Tối ưu hiệu năng |
| `ops:` | Hạ tầng / Docker / CI / deploy |
| `docs:` | Chỉ sửa tài liệu |
| `refactor:` | Sửa code, không đổi hành vi |
| `chore:` | Việc lặt vặt (bump version, format...) |

Ví dụ:
```
feat: thêm filter theo provider trong jobs
fix(provider): submit click không trigger generate API
ops: thêm cron auto-deploy trên VPS
docs: hướng dẫn quy trình deploy bằng tiếng Việt
```

Tiêu đề ≤ 70 ký tự. Nếu cần giải thích thêm thì xuống dòng cách 1 dòng,
viết phần body.

---

## Disable auto-deploy tạm thời

Nếu muốn dừng cron (ví dụ đang sửa khẩn cấp trên VPS):

```bash
ssh vpsroot@192.168.1.15
crontab -e
# Comment dòng auto_deploy.sh bằng dấu #
# Lưu, thoát
```

Bật lại:
```bash
crontab -e   # bỏ dấu # đi
# hoặc:
bash /home/vpsroot/grokflow/deploy/install_auto_deploy.sh
```

---

## File quan trọng

| File | Vai trò |
|---|---|
| `deploy/auto_deploy.sh` | Script cron chạy mỗi phút, thực hiện deploy |
| `deploy/install_auto_deploy.sh` | Cài đặt cron lần đầu trên VPS |
| `docker-compose.intranet.yml` | Cấu hình container — log rotation, resource limits |
| `.github/workflows/ci.yml` | Test + build mỗi khi push dev |
| `.github/workflows/deploy.yml` | Audit log + health check sau khi push prod |
| `docs/BRANCHING.md` | Doc chi tiết kỹ thuật (English) |
| `docs/QUY-TRINH-DEPLOY.md` | File này (tiếng Việt) |

---

## Nếu cần help

Hỏi đội dev qua kênh nội bộ. Nếu khẩn cấp:

1. Kiểm tra log: `ssh vpsroot@192.168.1.15 "tail -50 /home/vpsroot/grokflow-deploy.log"`
2. Health check: `curl https://flowgrok.vpspanel.io.vn/health` → phải trả `{"status":"ok"}`
3. Container status: `ssh vpsroot@192.168.1.15 "docker ps"`

Nếu trang trắng / 502: check `docker compose --env-file .env.prod -f docker-compose.intranet.yml logs --tail 50 backend`.
