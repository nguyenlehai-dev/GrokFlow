#!/usr/bin/env bash
set -e
cd "$(dirname "${BASH_SOURCE[0]}")"
echo "Khởi động GrokFlow..."
docker compose up -d
HTTP_PORT=$(grep -E '^HTTP_PORT=' .env 2>/dev/null | cut -d= -f2)
echo "GrokFlow đang chạy tại http://localhost:${HTTP_PORT:-80}"
