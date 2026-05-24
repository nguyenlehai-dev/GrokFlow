# Vendor — Hướng dẫn workflow hàng ngày

Bạn là maintainer của monorepo `GrokFlow`. Doc này giải thích cách dev
tính năng + ship cho 3 khách bằng 1 lệnh, không cần duplicate code.

## Mô hình mental

**Single source of truth = monorepo.**

Code Grok / Flow / Gateway sống ở:
- `backend/app/modules/grok/`
- `backend/app/modules/flow/`
- `backend/app/modules/gateway/`
- `frontend/src/modules/grok/`
- `frontend/src/modules/flow/`
- `frontend/src/modules/gateway/`

Bạn sửa code Ở ĐÂY. Mỗi product (`flowgrok`, `ai-gateway`,
`plxeditor-studio`) có 1 folder `products/<name>/` chỉ chứa **deploy
artifacts + manifest** (không có code copy). Khi muốn ship, script
`export_product.py` sẽ assemble code + deploy bundle → push lên repo
GitHub của product → khách `git pull` về VPS của họ.

## Workflow — sửa bug Grok cho khách

### Bước 1: Sửa code trong monorepo

```bash
cd ~/GrokFlow            # hoặc d:/MPV/Projects/GrokFlow trên Windows
vim backend/app/modules/grok/router.py
git add -A
git commit -m "fix(grok): retry CDP discovery 4x"
```

### Bước 2: Test trong monorepo local nếu cần

```bash
docker compose up -d
curl http://localhost:8000/health
```

(Monorepo dev có toàn bộ Grok+Flow+Gateway, login bằng admin của bạn.)

### Bước 3: Export sang product khách

```bash
# Lấy PAT mới (đã revoke cái cũ đúng không?)
export GITHUB_PAT=ghp_xxxxxxxxxxxxxxxxxxxx

# Ship cho flowgrok (khách Vũ)
python products/_scripts/export_product.py flowgrok
```

Script sẽ:
1. Đọc `products/flowgrok/manifest.yaml`
2. Pull các file backend + frontend cần thiết từ monorepo
3. Apply overrides + patches (tự động xử lý các khác biệt như drop
   FlowJob/Gateway models trong dashboard, vv)
4. Sinh `app/core/module_registry.py` dựa trên manifest
5. `git push --force` lên `https://github.com/nt7310063-boop/flowgrok.git`

Output bình thường:
```
== export flowgrok (FlowGrok — Grok image+video gateway) ==
-> copying backend (55 paths)
-> copying frontend (20 paths)
-> copying product deploy artifacts
-> copying customer scripts
-> applying overrides
  + override frontend/src/app/moduleRegistry.ts
  + override backend/app/models/__init__.py
  + rewrote module_registry.py with 17 modules
  + patched backend/app/modules/admin/dashboard/router.py
  ... (nhiều patches)
To https://github.com/nt7310063-boop/flowgrok.git
 + abc123...def456 HEAD -> main (forced update)
OK pushed
```

### Bước 4: Khách pull về VPS

Nếu khách đã cấu hình cron 3am tự động → khách tự nhận update sáng hôm sau.

Hoặc bạn ping khách: "Có update, chạy `bash _scripts/customer_update.sh` trên VPS nhé."

Hoặc khẩn cấp, bạn ssh vào VPS khách (nếu được cấp quyền) chạy hộ.

## Ship cho cả 3 khách cùng lúc

```bash
export GITHUB_PAT=ghp_xxx
for p in flowgrok ai-gateway plxeditor-studio; do
    echo "=== $p ==="
    python products/_scripts/export_product.py $p
done
```

3 push parallel. Mỗi khách `git pull` về repo của họ, không thấy code của khách khác.

## Dry-run (preview before push)

```bash
python products/_scripts/export_product.py flowgrok --no-push
# → ghi staging tree ra dist/flowgrok-<timestamp>/
```

Xem `dist/flowgrok-<timestamp>/` xem các file đã được lắp đúng chưa.

Test backend boot từ staging tree:
```bash
cd dist/flowgrok-<timestamp>/backend
python -c "
import os, base64
os.environ['DATABASE_URL'] = 'postgresql+asyncpg://x:x@localhost/x'
os.environ['JWT_SECRET'] = 'x'*32
os.environ['ENCRYPTION_KEY'] = base64.urlsafe_b64encode(b'x'*32).decode()
from app.main import app
print(f'{len(app.routes)} routes')
"
```

Nên cho `132` (flowgrok), `127` (ai-gateway), `143` (plxeditor-studio).

## Khi thêm 1 product mới (vd: "studio-mini")

1. **Tạo manifest**:
   ```bash
   cp -r products/flowgrok products/studio-mini
   vim products/studio-mini/manifest.yaml
   # Sửa: name, label, remote.url, include, drop, module_registry
   ```

2. **Tạo overrides nếu cần**:
   ```bash
   # Nếu studio-mini drop FlowJob/Gateway, copy template từ flowgrok:
   cp products/flowgrok/overrides/backend/app/models/__init__.py \
      products/studio-mini/overrides/backend/app/models/__init__.py
   # Sửa lại import list
   ```

3. **Tạo repo trên GitHub** (private, từ bạn):
   `https://github.com/nt7310063-boop/studio-mini`

4. **Push**:
   ```bash
   export GITHUB_PAT=ghp_xxx
   python products/_scripts/export_product.py studio-mini
   ```

5. **Add khách làm read collaborator**, mint PAT, gửi.

## Workflow gặp lỗi

### Export báo "missing path"
```
  ! missing: app/modules/grok/something
```

→ Path trong `manifest.yaml/include.backend` không có thật trong monorepo.
Sửa đường dẫn hoặc xóa khỏi `include`.

### Patch noop (cảnh báo nhưng không fail)
```
  - patch noop: backend/app/foo.py
```

→ Patch's `find`/`regex_find` không match. Hoặc file đã được patch
trước đó. Check file nội dung canonical vs pattern.

### Push fail (rejected - non-fast-forward)
```
 ! [rejected]   HEAD -> main (fetch first)
```

→ Repo khách có commit khác. Force push bằng `git push --force` — an
toàn vì khách không nên có local commit. `export_product.py` mặc định
dùng `--force`.

### BE crash sau khi khách `customer_update.sh`

Check log:
```bash
ssh customer-vps "cd /opt/flowgrok && docker compose logs backend --tail=50"
```

Phổ biến:
- `ImportError: FlowJob` → khách đang dùng product không có FlowJob nhưng code reference nó. Cần patch trong manifest.
- `AttributeError: 'NoneType' object has no attribute 'x'` → một model bị stub `= None` nhưng code body vẫn dùng. Patch body.

Sửa trong manifest → re-export → khách re-pull.

## Best practices

- **1 logical change = 1 commit + 1 export**. Đừng commit 3 thứ khác nhau rồi export 1 lần — khó rollback.
- **Test monorepo trước**. Nếu monorepo broken → tất cả product cũng broken.
- **Đặt tag git khi ship version quan trọng**: `git tag v0.5.1 && git push --tags`. Sau này khách có vấn đề, biết bạn shipped gì.
- **Đọc HANDOFF.md** của từng product trước khi đổi big things — có ghi quirks per khách.
- **PAT vendor khác PAT khách**:
  - Vendor PAT: `Contents: Write` (để push)
  - Customer PAT: `Contents: Read` (chỉ clone/pull)
- **Đừng commit PAT vào code**. Dùng env var hoặc Windows Credential Manager.
