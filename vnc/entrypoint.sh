#!/usr/bin/env bash
set -euo pipefail

# Ensure /config is writable by vncuser (volume mount may come in as root).
chown -R vncuser:vncuser /config 2>/dev/null || true

# Clean stale Chromium lock files so a previous unclean shutdown doesn't block startup.
rm -f /config/SingletonLock /config/SingletonCookie /config/SingletonSocket 2>/dev/null || true

exec /usr/bin/supervisord -c /etc/supervisor/conf.d/grokflow.conf
