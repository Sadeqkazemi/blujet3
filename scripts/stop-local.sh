#!/usr/bin/env bash
# Stop blujet local dev servers started by start-local.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LOG_DIR="$ROOT/.local-dev-logs"

stop_pid() {
  local name="$1"
  local pidfile="$LOG_DIR/$name.pid"
  if [[ -f "$pidfile" ]]; then
    local pid
    pid="$(cat "$pidfile")"
    if kill -0 "$pid" 2>/dev/null; then
      echo "▶ Stopping $name (pid $pid)…"
      # Kill the whole process group when possible (npm → sh → nest/vite)
      kill -- -"$pid" 2>/dev/null || kill "$pid" 2>/dev/null || true
      sleep 1
      kill -9 -- -"$pid" 2>/dev/null || kill -9 "$pid" 2>/dev/null || true
    fi
    rm -f "$pidfile"
  fi
}

stop_pid backend
stop_pid frontend
rm -f "$LOG_DIR/frontend-8080.pid" 2>/dev/null || true

# Sweep orphan watchers left by interrupted restarts (Cloud Agent / nohup)
pkill -f "$ROOT/backend/node_modules/.bin/nest" 2>/dev/null || true
pkill -f "$ROOT/frontend/node_modules/.bin/vite" 2>/dev/null || true
pkill -f "node --enable-source-maps $ROOT/backend/dist" 2>/dev/null || true

# Also stop anything still listening on dev ports (best-effort)
for port in 5173 3000 8080; do
  if command -v lsof >/dev/null 2>&1; then
    pids=$(lsof -t -i:"$port" -sTCP:LISTEN 2>/dev/null || true)
    if [[ -n "$pids" ]]; then
      echo "▶ Freeing port $port…"
      # shellcheck disable=SC2086
      kill $pids 2>/dev/null || true
      sleep 1
      # shellcheck disable=SC2086
      kill -9 $pids 2>/dev/null || true
    fi
  fi
done

echo "✅ Local dev servers stopped."
