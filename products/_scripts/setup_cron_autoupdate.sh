#!/usr/bin/env bash
# setup_cron_autoupdate.sh — wire a nightly auto-update cron for each
# standalone stack on this host. Idempotent (overwrites the per-stack
# cron line; doesn't append duplicates).
#
# Schedule: 3:00 / 3:10 / 3:20 staggered so they don't all hammer
# docker + git at once.

set -euo pipefail

stagger=0
for stack_port in "flowgrok-standalone:28000" "ai-gateway-standalone:38000" "plxeditor-studio-standalone:48000"; do
    stack="${stack_port%:*}"
    port="${stack_port#*:}"
    if [ ! -d "/home/vpsroot/${stack}" ]; then
        echo "skip ${stack} (dir missing)"
        continue
    fi
    minute=$((stagger * 10))
    line="${minute} 3 * * * cd /home/vpsroot/${stack} && bash _scripts/customer_update.sh >> /home/vpsroot/cron-${stack}.log 2>&1"
    # Strip any existing cron line for this stack, then append.
    crontab -l 2>/dev/null | grep -v "${stack}/customer_update.sh" > /tmp/_cron_tmp || true
    echo "${line}" >> /tmp/_cron_tmp
    crontab /tmp/_cron_tmp
    rm /tmp/_cron_tmp
    echo "scheduled: ${stack} at 03:$(printf '%02d' ${minute})"
    stagger=$((stagger + 1))
done

# Pre-create log files in $HOME (cron runs as vpsroot).
touch /home/vpsroot/cron-flowgrok-standalone.log \
      /home/vpsroot/cron-ai-gateway-standalone.log \
      /home/vpsroot/cron-plxeditor-studio-standalone.log

echo
echo "Current crontab:"
crontab -l
