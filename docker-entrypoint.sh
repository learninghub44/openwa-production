#!/bin/sh
# Runs as root (via dumb-init). Fixes named-volume ownership, runs DB migrations,
# then drops to the openwa user via gosu so the Node process never holds root privileges.
set -e

mkdir -p /app/data/sessions /app/data/media /app/data/plugins
chown -R openwa:openwa /app/data

# Remove stale Chromium lock files from unclean shutdowns
rm -f /app/data/sessions/*/Singleton* 2>/dev/null || true

# Chromium needs writable config/cache dirs
if ! mkdir -p "${XDG_CONFIG_HOME:-/tmp/.config}" "${XDG_CACHE_HOME:-/tmp/.cache}"; then
  echo "FATAL: cannot create Chromium config/cache dirs." >&2
  exit 1
fi
chown openwa:openwa "${XDG_CONFIG_HOME:-/tmp/.config}" "${XDG_CACHE_HOME:-/tmp/.cache}"

# ── Database migrations ───────────────────────────────────────────────────────
# Run as openwa user (same user as the app) before starting the server.
# Uses the compiled JS datasources so no ts-node needed in production.
# Failures are non-fatal — the app will surface the DB error on boot.
echo "[entrypoint] Running database migrations..."

gosu openwa sh -c 'node_modules/.bin/typeorm migration:run -d dist/database/data-source.js' 2>&1 \
  && echo "[entrypoint] Data DB migrations: OK" \
  || echo "[entrypoint] WARNING: data DB migrations failed (continuing)"

gosu openwa sh -c 'node_modules/.bin/typeorm migration:run -d dist/database/data-source-main.js' 2>&1 \
  && echo "[entrypoint] Main DB migrations: OK" \
  || echo "[entrypoint] WARNING: main DB migrations failed (continuing)"

echo "[entrypoint] Starting application..."

# exec into node so it becomes PID 1's direct child (clean signal forwarding)
exec gosu openwa "$@"
