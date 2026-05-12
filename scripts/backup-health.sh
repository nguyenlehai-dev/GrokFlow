#!/usr/bin/env bash
# Backup freshness check — exits non-zero if no snapshot was made in the
# last MAX_AGE_MIN minutes.
#
# Cron-friendly: silent on success, prints + non-zero exit on staleness.
# Pipe to a notification of your choice (email, ntfy.sh, telegram, …).
#
# Example:
#   */30 * * * * /home/vpsroot/grokflow/scripts/backup-health.sh \
#       || curl -X POST 'https://ntfy.sh/grokflow' -d "backup is stale!"

set -euo pipefail

PROJECT_ROOT="/home/vpsroot/grokflow"
# shellcheck source=/dev/null
source "$PROJECT_ROOT/.backup-env"

# Allow 1.5× the backup interval so a 15-min cron has up to 22min slack
# before alerting (a missed run is fine, two in a row is not).
MAX_AGE_MIN="${MAX_AGE_MIN:-22}"

# Newest snapshot timestamp via `restic snapshots --json`.
NEWEST_TIME=$(
    restic snapshots --tag state --json 2>/dev/null \
    | python3 -c "
import json, sys
snaps = json.load(sys.stdin)
if not snaps:
    sys.exit(1)
print(max(s['time'] for s in snaps))
"
)
[[ -n "$NEWEST_TIME" ]] || { echo "no snapshots in repo"; exit 2; }

# How many minutes ago was that snapshot taken?
AGE_MIN=$(python3 -c "
import datetime, sys
t = datetime.datetime.fromisoformat('$NEWEST_TIME'.replace('Z','+00:00'))
now = datetime.datetime.now(datetime.timezone.utc)
print(int((now - t).total_seconds() / 60))
")

if (( AGE_MIN > MAX_AGE_MIN )); then
    echo "STALE: newest snapshot is $AGE_MIN min old (limit $MAX_AGE_MIN). Time: $NEWEST_TIME"
    exit 1
fi

# Silent on success — cron mail won't spam.
exit 0
