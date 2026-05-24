#!/usr/bin/env bash
# backup_db.sh — pg_dump + giữ rolling N ngày + optional offsite upload.
#
# Mục tiêu: VPS chết / disk fail / ransomware → restore được PROD trong
# vòng 1 giờ. Hiện tại không có gì → mất hết.
#
# Cron khuyến nghị (root crontab):
#   0 3 * * * /home/vpsroot/grokflow/deploy/backup_db.sh >> /var/log/grokflow-backup.log 2>&1
#
# Env vars (optional, set trong /etc/default/grokflow-backup hoặc inline):
#   BACKUP_DIR        local dir để lưu .sql.gz (default /var/backups/grokflow)
#   KEEP_DAYS         số ngày giữ backup local (default 14)
#   OFFSITE_URL       rclone remote (vd: "s3:grokflow-backups") — bỏ trống = local only
#   DISCORD_WEBHOOK   gửi notify success/fail tới Discord/Slack-compat webhook
#
# Restore (manual):
#   gunzip < /var/backups/grokflow/grokflow-2026-05-24.sql.gz | \
#       docker exec -i grokflow-postgres-1 psql -U grokflow -d grokflow
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/var/backups/grokflow}"
KEEP_DAYS="${KEEP_DAYS:-14}"
TS=$(date -u +%Y-%m-%d)
DATE_PRETTY=$(date -u +'%Y-%m-%d %H:%M UTC')

mkdir -p "$BACKUP_DIR"

# ── Notify helper ─────────────────────────────────────────────────────────
notify() {
    local emoji="$1" status="$2" detail="$3"
    if [[ -n "${DISCORD_WEBHOOK:-}" ]]; then
        curl -fsSL -X POST -H 'Content-Type: application/json' \
             -d "{\"content\": \"$emoji **GrokFlow Backup** — $status\n\`\`\`\n$detail\n\`\`\`\"}" \
             "$DISCORD_WEBHOOK" > /dev/null || true
    fi
}

# ── Backup containers grokflow-postgres-1 và standalones ─────────────────
# Iterate qua tất cả postgres containers cho cả main + standalones.
# Convention: container name kết thúc bằng "-postgres-1".
failed=0
successful_files=()

for container in $(docker ps --format '{{.Names}}' | grep -E -- '-postgres-1$' || true); do
    pg_user=$(docker exec "$container" sh -c 'echo $POSTGRES_USER' 2>/dev/null | tr -d '[:space:]')
    pg_db=$(docker exec "$container" sh -c 'echo $POSTGRES_DB' 2>/dev/null | tr -d '[:space:]')
    if [[ -z "$pg_user" || -z "$pg_db" ]]; then
        echo "[$DATE_PRETTY] skip $container — missing POSTGRES_USER/DB env"
        continue
    fi
    out="$BACKUP_DIR/${container}_${TS}.sql.gz"
    echo "[$DATE_PRETTY] dumping $container ($pg_user/$pg_db) → $out"
    if docker exec "$container" pg_dump -U "$pg_user" -d "$pg_db" --no-owner --no-privileges \
       | gzip -9 > "$out"; then
        size=$(du -h "$out" | cut -f1)
        echo "[$DATE_PRETTY] ✓ $container — $size"
        successful_files+=("$container ($size)")
    else
        echo "[$DATE_PRETTY] ✗ $container failed"
        rm -f "$out"
        failed=$((failed + 1))
    fi
done

# ── Prune local — keep N days ─────────────────────────────────────────────
find "$BACKUP_DIR" -name '*.sql.gz' -mtime "+$KEEP_DAYS" -print -delete || true

# ── Offsite upload (optional) ─────────────────────────────────────────────
if [[ -n "${OFFSITE_URL:-}" ]] && command -v rclone >/dev/null 2>&1; then
    echo "[$DATE_PRETTY] uploading to $OFFSITE_URL"
    if rclone copy "$BACKUP_DIR" "$OFFSITE_URL" --include "*_${TS}.sql.gz" --quiet; then
        echo "[$DATE_PRETTY] ✓ offsite OK"
    else
        echo "[$DATE_PRETTY] ✗ offsite upload failed"
        failed=$((failed + 1))
    fi
fi

# ── Notify ────────────────────────────────────────────────────────────────
summary=$(printf '%s\n' "${successful_files[@]:-(no dumps)}")
disk_pct=$(df -h "$BACKUP_DIR" | awk 'NR==2 {print $5}')
if [[ "$failed" -gt 0 ]]; then
    notify "⚠️" "PARTIAL FAIL ($failed errors)" "$summary"$'\n'"Disk: $disk_pct"
    exit 1
else
    notify "✅" "OK ($TS)" "$summary"$'\n'"Disk: $disk_pct · Kept ${KEEP_DAYS} days"
fi
