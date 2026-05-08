#!/usr/bin/env bash
# Run as root to fix volume permissions and grant docker socket access,
# then drop to grokflow.
set -euo pipefail

if [[ "$(id -u)" == "0" ]]; then
    chown -R grokflow:grokflow /app/storage /app/browser_profiles 2>/dev/null || true

    # If Docker socket is mounted, ensure grokflow can talk to it by
    # joining the host's docker group (whatever its GID happens to be).
    if [[ -S /var/run/docker.sock ]]; then
        DOCKER_GID=$(stat -c '%g' /var/run/docker.sock)
        if ! getent group dockerhost >/dev/null; then
            groupadd -g "$DOCKER_GID" dockerhost 2>/dev/null \
              || groupadd dockerhost  # GID collision fallback
        fi
        usermod -aG dockerhost grokflow 2>/dev/null || true
    fi

    exec gosu grokflow "$@"
fi
exec "$@"
