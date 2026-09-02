#!/usr/bin/env bash
# One-command local dev: Postgres + Redis + backend + frontend.
# Usage: ./scripts/start-local.sh
# Status: ./scripts/status-local.sh
# Stop:   ./scripts/stop-local.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
LOG_DIR="$ROOT/.local-dev-logs"
mkdir -p "$LOG_DIR"

red() { printf '\033[31m%s\033[0m\n' "$*"; }
green() { printf '\033[32m%s\033[0m\n' "$*"; }
yellow() { printf '\033[33m%s\033[0m\n' "$*"; }

port_in_use() {
  local port="$1"
  if command -v lsof >/dev/null 2>&1; then
    lsof -i:"$port" -sTCP:LISTEN >/dev/null 2>&1
    return
  fi
  ss -tln 2>/dev/null | rg -q ":$port "
}

ensure_env() {
  local example="$1"
  local target="$2"
  if [[ ! -f "$target" && -f "$example" ]]; then
    echo "▶ Creating $(basename "$target") from example…"
    cp "$example" "$target"
  fi
}

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    red "❌ Required command not found: $1"
    exit 1
  fi
}

require_cmd node
require_cmd npm
require_cmd curl

echo "▶ Stopping any previous dev servers…"
"$ROOT/scripts/stop-local.sh" 2>/dev/null || true

for port in 5173 3000; do
  if port_in_use "$port"; then
    yellow "⚠ Port $port still in use — trying to free it…"
    if command -v lsof >/dev/null 2>&1; then
      pids=$(lsof -t -i:"$port" -sTCP:LISTEN 2>/dev/null || true)
      [[ -n "$pids" ]] && kill $pids 2>/dev/null || true
      sleep 1
    fi
  fi
done

ensure_env "$ROOT/backend/.env.example" "$ROOT/backend/.env"
ensure_env "$ROOT/frontend/.env.example" "$ROOT/frontend/.env"

if command -v docker >/dev/null 2>&1; then
  if ! docker info >/dev/null 2>&1; then
    red "❌ Docker is installed but not running. Start Docker Desktop, then retry."
    exit 1
  fi
  echo "▶ Starting Postgres + Redis (docker compose)…"
  docker compose up -d
  echo "▶ Waiting for Postgres…"
  ready=0
  for i in $(seq 1 45); do
    if docker compose exec -T db pg_isready -U blujet >/dev/null 2>&1; then
      ready=1
      break
    fi
    sleep 1
  done
  if [[ "$ready" -ne 1 ]]; then
    red "❌ Postgres did not become ready. Check: docker compose logs db"
    exit 1
  fi
else
  yellow "⚠ docker not found — assuming Postgres (5432) and Redis (6379) already running."
fi

if [[ ! -d backend/node_modules ]]; then
  echo "▶ Installing backend dependencies…"
  (cd backend && npm install)
fi

if [[ ! -d frontend/node_modules ]]; then
  echo "▶ Installing frontend dependencies…"
  (cd frontend && npm install)
fi

echo "▶ Applying database migrations…"
(cd backend && npm run migration:run)
echo "▶ Seeding database…"
(cd backend && npm run seed 2>/dev/null || true)

echo "▶ Building backend…"
(cd backend && npx nest build)

echo "▶ Starting backend on :3000…"
# Prefer the compiled app over `nest start --watch` here: watch mode can
# sit idle after compile without binding the port (seen in cloud VMs).
(cd backend && nohup node --enable-source-maps dist/src/main > "$LOG_DIR/backend.log" 2>&1 & echo $! > "$LOG_DIR/backend.pid")

echo "▶ Starting frontend on :5173…"
(cd frontend && nohup npm run dev -- --host 0.0.0.0 --port 5173 > "$LOG_DIR/frontend.log" 2>&1 & echo $! > "$LOG_DIR/frontend.pid")

echo "▶ Waiting for servers (up to ~90s)…"
for i in $(seq 1 45); do
  FE=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:5173/ 2>/dev/null || echo 0)
  BE=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3000/health 2>/dev/null || echo 0)
  if [[ "$FE" == "200" && "$BE" == "200" ]]; then
    echo ""
    green "✅ blujet is running!"
    echo ""
    echo "   Frontend:  http://localhost:5173/login"
    echo "   Backend:   http://localhost:3000/health"
    echo "   Staff login: chair / Blujet@1404"
    echo ""
    echo "   Logs: $LOG_DIR/backend.log  |  $LOG_DIR/frontend.log"
    echo "   Status: ./scripts/status-local.sh"
    echo "   Stop: ./scripts/stop-local.sh"
    echo ""
    yellow "   Cursor Cloud? Forward port 5173 (frontend) in the Ports tab — NOT 3000."
    yellow "   Open the forwarded 5173 URL (…/login). Port 3000 is API-only and shows JSON 404 on /."
    exit 0
  fi
  printf '.'
  sleep 2
done

echo ""
red "❌ Servers did not start in time."
echo ""
echo "Run diagnostics:"
echo "   ./scripts/status-local.sh"
echo ""
echo "Common fixes:"
echo "   1. Start Docker Desktop, then: docker compose up -d"
echo "   2. Free ports: ./scripts/stop-local.sh"
echo "   3. Check logs:"
echo "      tail -50 $LOG_DIR/backend.log"
echo "      tail -50 $LOG_DIR/frontend.log"
exit 1
