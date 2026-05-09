#!/usr/bin/env bash
# install_auto_deploy.sh — one-shot setup on the VPS.
#
# What it does:
#   1. Initialize a git repo in the existing /home/vpsroot/grokflow dir
#      (without nuking your .env.prod, browser_profiles/, storage/).
#   2. Set origin to GitHub and check out the prod branch.
#   3. Install a cron entry that runs deploy/auto_deploy.sh every minute.
#
# Usage (one-time, run on the VPS):
#   curl -fsSL https://raw.githubusercontent.com/nguyenlehai-dev/GrokFlow/prod/deploy/install_auto_deploy.sh | bash
# OR copy this file over and run:
#   bash deploy/install_auto_deploy.sh

set -euo pipefail

REPO_URL="${REPO_URL:-https://github.com/nguyenlehai-dev/GrokFlow.git}"
REPO_DIR="${REPO_DIR:-/home/vpsroot/grokflow}"
BRANCH="${BRANCH:-prod}"
LOG="${LOG:-/var/log/grokflow-deploy.log}"

cd "$REPO_DIR"

# 1. Init git if not already initialized
if [[ ! -d .git ]]; then
    echo "==> Initializing git repo in $REPO_DIR"
    git init -q
    git remote add origin "$REPO_URL" || true
fi

# Make sure remote is correct
git remote set-url origin "$REPO_URL"

# 2. Fetch + reset to origin/<branch>. Untracked files (.env.prod,
# browser_profiles/, storage/) are preserved by `git reset --hard`.
echo "==> Fetching origin/$BRANCH"
git fetch origin "$BRANCH"

# Create local tracking branch if missing
if ! git show-ref --verify --quiet "refs/heads/$BRANCH"; then
    git checkout -b "$BRANCH" "origin/$BRANCH"
else
    git checkout "$BRANCH"
    git reset --hard "origin/$BRANCH"
fi

# Make scripts executable
chmod +x deploy/auto_deploy.sh deploy/install_auto_deploy.sh 2>/dev/null || true

# 3. Install cron — runs every minute. The lock file inside auto_deploy.sh
# prevents overlapping runs while a deploy is in progress.
CRON_LINE="* * * * * $REPO_DIR/deploy/auto_deploy.sh $BRANCH >> $LOG 2>&1"

# Make sure log file exists and is writable
sudo touch "$LOG" 2>/dev/null || touch "$LOG" 2>/dev/null || true
sudo chown "$(whoami)" "$LOG" 2>/dev/null || true

# Append to crontab (idempotent — replaces existing line if present)
( crontab -l 2>/dev/null | grep -v "auto_deploy.sh" ; echo "$CRON_LINE" ) | crontab -

echo
echo "==> Done. Cron is now polling origin/$BRANCH every minute."
echo "    Log: $LOG"
echo "    Manual run: bash $REPO_DIR/deploy/auto_deploy.sh $BRANCH"
echo "    Disable: crontab -e (delete the auto_deploy line)"
crontab -l | grep auto_deploy.sh
