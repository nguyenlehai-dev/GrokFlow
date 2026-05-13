#!/usr/bin/env bash
set -euo pipefail

# Ensure /config is writable by vncuser (volume mount may come in as root).
chown -R vncuser:vncuser /config 2>/dev/null || true

# Clean stale Chromium lock files so a previous unclean shutdown doesn't block startup.
# Two locations to clean:
#  1) /config/SingletonLock — the user-data-dir lock (Chromium creates here
#     when /tmp and user-data-dir share a filesystem).
#  2) /tmp/org.chromium.Chromium.*/Singleton* — the IPC socket files
#     Chromium uses when /tmp is on a different filesystem from the
#     user-data-dir (our case — /config is a bind-mounted volume). These
#     are what caused exit-21 crashloops in prod after a backend restart.
rm -f /config/SingletonLock /config/SingletonCookie /config/SingletonSocket 2>/dev/null || true
rm -rf /tmp/org.chromium.Chromium.* 2>/dev/null || true

exec /usr/bin/supervisord -c /etc/supervisor/conf.d/grokflow.conf
