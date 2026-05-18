#!/usr/bin/env bash
set -e
cd "$(dirname "${BASH_SOURCE[0]}")"

cat <<'EOF'

============================================================
  CẢNH BÁO: thao tác này sẽ xóa TOÀN BỘ dữ liệu GrokFlow
  (user, prompt, chat history, jobs, browser profiles).
  Không thể khôi phục.
============================================================

EOF

read -r -p "Gõ 'YES' (chữ hoa) để xác nhận: " CONFIRM
if [[ "$CONFIRM" != "YES" ]]; then
    echo "Đã hủy."
    exit 0
fi

echo "[..] Dừng và xóa containers + volumes..."
docker compose down -v
echo "[..] Xóa Docker images..."
docker image rm grokflow/backend:latest grokflow/frontend:latest 2>/dev/null || true
echo
echo "Đã gỡ cài đặt. File .env vẫn còn trên disk — xóa thủ công nếu muốn."
