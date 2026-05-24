#!/usr/bin/env bash
set -e
for stack_db in "flowgrok-standalone:flowgrok_sa" "ai-gateway-standalone:ai_gateway_sa" "plxeditor-studio-standalone:plxeditor_sa"; do
    stack="${stack_db%%:*}"
    db="${stack_db##*:}"
    echo "=== $stack ==="
    docker compose -f /home/vpsroot/$stack/docker-compose.yml exec -T postgres psql -U "$db" -d "$db" <<SQL
UPDATE users SET role='super_admin' WHERE role='admin';
SELECT email, role FROM users;
SQL
done
