#!/usr/bin/env bash
# GrokFlow self-host installer for Linux / macOS.
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

cat <<'EOF'

============================================================
  GrokFlow Self-Host Installer
============================================================

EOF

# ── 1. Check Docker ─────────────────────────────────────────
if ! command -v docker >/dev/null 2>&1; then
    echo "[ERROR] Không tìm thấy Docker."
    echo "Cài Docker tại: https://docs.docker.com/engine/install/"
    exit 1
fi
if ! docker info >/dev/null 2>&1; then
    echo "[ERROR] Docker daemon không chạy. Hãy start Docker trước."
    exit 1
fi
if ! docker compose version >/dev/null 2>&1; then
    echo "[ERROR] Docker Compose v2 chưa được cài. Cài lại Docker Desktop hoặc 'docker-compose-plugin'."
    exit 1
fi
echo "[OK] Docker sẵn sàng."

# ── 2. Generate .env if missing ─────────────────────────────
if [[ -f .env ]]; then
    echo "[OK] .env đã tồn tại — giữ nguyên secrets cũ."
else
    echo "[..] Tạo file .env với secrets ngẫu nhiên..."
    cp .env.example .env
    PG_PW=$(LC_ALL=C tr -dc 'A-Za-z0-9' </dev/urandom | head -c 24)
    JWT=$(LC_ALL=C tr -dc 'a-f0-9' </dev/urandom | head -c 64)
    if command -v openssl >/dev/null 2>&1; then
        FERNET=$(openssl rand -base64 32)
    else
        FERNET=$(LC_ALL=C tr -dc 'A-Za-z0-9+/' </dev/urandom | head -c 44)
    fi
    # Use sed -i with portable in-place
    if [[ "$(uname)" == "Darwin" ]]; then
        sed -i '' "s|POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=$PG_PW|" .env
        sed -i '' "s|JWT_SECRET=.*|JWT_SECRET=$JWT|" .env
        sed -i '' "s|ENCRYPTION_KEY=.*|ENCRYPTION_KEY=$FERNET|" .env
    else
        sed -i "s|POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=$PG_PW|" .env
        sed -i "s|JWT_SECRET=.*|JWT_SECRET=$JWT|" .env
        sed -i "s|ENCRYPTION_KEY=.*|ENCRYPTION_KEY=$FERNET|" .env
    fi
    echo "[OK] Đã tạo .env với secrets mới."
fi

# ── 3. Load bundled images (offline) ────────────────────────
if [[ -f images/backend.tar ]]; then
    echo "[..] Loading Docker images (offline)..."
    for img in postgres redis backend frontend; do
        if [[ -f "images/${img}.tar" ]]; then
            docker load -i "images/${img}.tar"
        fi
    done
    echo "[OK] Đã load images."
else
    echo "[..] Không có images offline — sẽ pull từ Docker registry..."
fi

# ── 4. Start stack ──────────────────────────────────────────
echo "[..] Khởi động GrokFlow (lần đầu có thể mất 1-2 phút)..."
docker compose up -d

# ── 5. Wait for init to complete + show admin password ──────
echo "[..] Chờ database migration + seed admin user..."
# docker compose wait would be cleaner but isn't on every version.
for i in $(seq 1 60); do
    state=$(docker compose ps init --format '{{.State}}' 2>/dev/null || echo "")
    if [[ "$state" == "exited" ]]; then break; fi
    sleep 2
done

echo
echo "=== SEED OUTPUT ==="
docker compose logs init --tail=20 --no-log-prefix
echo "=== END ==="
echo

# ── 6. Wait for web UI ───────────────────────────────────────
echo "[..] Chờ web UI sẵn sàng..."
HTTP_PORT=$(grep -E '^HTTP_PORT=' .env | cut -d= -f2)
HTTP_PORT=${HTTP_PORT:-80}
for i in $(seq 1 30); do
    if curl -fsS -o /dev/null "http://localhost:${HTTP_PORT}/"; then
        echo "[OK] GrokFlow sẵn sàng!"
        break
    fi
    sleep 2
done

cat <<EOF

============================================================
  CÀI ĐẶT HOÀN TẤT
  URL:   http://localhost:${HTTP_PORT}
  Email + password admin xem ở phần SEED OUTPUT phía trên.
============================================================

Lệnh hữu ích:
  ./start.sh      - khởi động lại
  ./stop.sh       - dừng
  ./uninstall.sh  - gỡ cài đặt (xóa hoàn toàn)

EOF
