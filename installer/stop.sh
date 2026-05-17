#!/usr/bin/env bash
set -e
cd "$(dirname "${BASH_SOURCE[0]}")"
echo "Dừng GrokFlow..."
docker compose stop
echo "Đã dừng. Dữ liệu vẫn được giữ trong Docker volumes."
echo "Chạy ./start.sh để bật lại."
