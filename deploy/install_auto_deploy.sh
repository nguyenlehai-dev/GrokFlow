#!/usr/bin/env bash
# install_auto_deploy.sh — one-shot setup on the VPS for a given branch.
#
# What it does:
#   1. Initialize a git repo at the target directory (preserves any existing
#      .env, browser_profiles/, storage/ — they're not in the index).
#   2. Set origin to GitHub and check out the requested branch.
#   3. Install a cron entry that runs deploy/auto_deploy.sh every minute.
#
# Usage (one-time, run on the VPS):
#   # Prod (default — backwards-compatible with the legacy invocation):
#   bash deploy/install_auto_deploy.sh
#
#   # Staging (separate dir, separate compose project, separate cron entry):
#   bash deploy/install_auto_deploy.sh --branch staging
#
# Env overrides:
#   REPO_URL  GitHub repo URL  (default: https://github.com/nguyenlehai-dev/GrokFlow.git)
#   REPO_DIR  Override target dir (default: /home/vpsroot/grokflow[-<branch>])
#   LOG       Override log path   (default: /home/vpsroot/grokflow-deploy-<branch>.log,
#                                  or /home/vpsroot/grokflow-deploy.log for prod)

set -euo pipefail

BRANCH="prod"
while [[ $# -gt 0 ]]; do
    case "$1" in
        --branch) BRANCH="$2"; shift 2 ;;
        --branch=*) BRANCH="${1#--branch=}"; shift ;;
        -h|--help)
            sed -n '1,25p' "$0"; exit 0 ;;
        *)
            echo "unknown arg: $1" >&2; exit 1 ;;
    esac
done

REPO_URL="${REPO_URL:-https://github.com/nguyenlehai-dev/GrokFlow.git}"

case "$BRANCH" in
    prod)
        DEFAULT_REPO_DIR="/home/vpsroot/grokflow"
        DEFAULT_LOG="/home/vpsroot/grokflow-deploy.log"
        ;;
    *)
        DEFAULT_REPO_DIR="/home/vpsroot/grokflow-${BRANCH}"
        DEFAULT_LOG="/home/vpsroot/grokflow-deploy-${BRANCH}.log"
        ;;
esac

REPO_DIR="${REPO_DIR:-$DEFAULT_REPO_DIR}"
LOG="${LOG:-$DEFAULT_LOG}"

mkdir -p "$REPO_DIR"
cd "$REPO_DIR"

# 1. Init git if not already initialized
if [[ ! -d .git ]]; then
    echo "==> Initializing git repo in $REPO_DIR"
    git init -q
    git remote add origin "$REPO_URL" || true
fi
git remote set-url origin "$REPO_URL"

# 2. Sync to origin/<branch>. Untracked files (.env.*, browser_profiles/,
# storage/, *.log) are preserved.
echo "==> Fetching origin/$BRANCH"
git fetch --quiet origin "$BRANCH"

echo "==> Syncing working tree to origin/$BRANCH"
git checkout -f -B "$BRANCH" "origin/$BRANCH"
git reset --hard "origin/$BRANCH"

chmod +x deploy/auto_deploy.sh deploy/install_auto_deploy.sh 2>/dev/null || true

# Ensure an .env file exists so docker compose doesn't refuse to start.
# For staging we seed from .env.prod.example if no .env.staging is present.
case "$BRANCH" in
    prod)
        ENV_FILE=".env.prod"
        ;;
    *)
        ENV_FILE=".env.${BRANCH}"
        ;;
esac
if [[ ! -f "$ENV_FILE" ]]; then
    echo "==> $ENV_FILE not found. Seeding from .env.prod.example — edit before next cron tick!"
    cp .env.prod.example "$ENV_FILE"
fi

# 3. Install cron. The lock file inside auto_deploy.sh handles concurrency
# between overlapping ticks of the same branch.
CRON_LINE="* * * * * $REPO_DIR/deploy/auto_deploy.sh $BRANCH >> $LOG 2>&1"
CRON_MARK="auto_deploy.sh $BRANCH"  # unique per branch, so prod and staging coexist

touch "$LOG" 2>/dev/null || true
( crontab -l 2>/dev/null | grep -v -F "$CRON_MARK" ; echo "$CRON_LINE" ) | crontab -

echo
echo "==> Done. Cron is now polling origin/$BRANCH every minute."
echo "    Dir:     $REPO_DIR"
echo "    Log:     $LOG"
echo "    Env:     $REPO_DIR/$ENV_FILE"
echo "    Manual:  bash $REPO_DIR/deploy/auto_deploy.sh $BRANCH"
echo "    Disable: crontab -e (delete the matching auto_deploy line)"
crontab -l | grep "auto_deploy.sh"
