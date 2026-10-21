#!/usr/bin/env bash
# Restart the Fulfillment API (port 8001) safely, even from a shell that
# mentions uvicorn in its own command line.
set -euo pipefail

BACKEND_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../backend" && pwd)"
PORT="${PORT:-8001}"
LOG="${LOG:-/tmp/fulfillment-backend.log}"

if command -v fuser >/dev/null 2>&1; then
  fuser -k "${PORT}/tcp" >/dev/null 2>&1 || true
else
  pids="$(ss -tlnp 2>/dev/null | awk -v p=":${PORT}" '$4 ~ p {print $NF}' | grep -oE '[0-9]+' | sort -u || true)"
  for pid in ${pids:-}; do kill "$pid" 2>/dev/null || true; done
fi

sleep 1
cd "$BACKEND_DIR"
setsid .venv/bin/uvicorn app.main:app --host 0.0.0.0 --port "$PORT" >> "$LOG" 2>&1 < /dev/null &
disown || true

for _ in $(seq 1 30); do
  if curl -sf --max-time 2 "http://localhost:${PORT}/" >/dev/null 2>&1; then
    echo "API ready on :${PORT}"
    exit 0
  fi
  sleep 1
done

echo "API failed to start on :${PORT}; see ${LOG}" >&2
exit 1
