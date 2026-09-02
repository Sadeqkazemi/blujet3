#!/usr/bin/env bash
# Quick health check for blujet local dev stack.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LOG_DIR="$ROOT/.local-dev-logs"

red() { printf '\033[31m%s\033[0m\n' "$*"; }
green() { printf '\033[32m%s\033[0m\n' "$*"; }
yellow() { printf '\033[33m%s\033[0m\n' "$*"; }

echo "blujet local dev — status"
echo "========================="

if command -v docker >/dev/null 2>&1; then
  if docker compose -f "$ROOT/docker-compose.yml" ps --status running 2>/dev/null | rg -q 'db|redis'; then
    green "✓ Docker: Postgres + Redis containers running"
  else
    yellow "⚠ Docker: db/redis not running — run: docker compose up -d"
  fi
else
  yellow "⚠ Docker: not installed (Postgres 5432 + Redis 6379 must already be up)"
fi

for port in 5173 3000; do
  if command -v lsof >/dev/null 2>&1 && lsof -i:"$port" -sTCP:LISTEN >/dev/null 2>&1; then
    green "✓ Port $port: listening"
  elif ss -tln 2>/dev/null | rg -q ":$port "; then
    green "✓ Port $port: listening"
  else
    red "✗ Port $port: nothing listening"
  fi
done

FE=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:5173/ 2>/dev/null || echo 0)
BE=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3000/health 2>/dev/null || echo 0)

if [[ "$FE" == "200" ]]; then
  green "✓ Frontend http://127.0.0.1:5173/ → HTTP $FE"
else
  red "✗ Frontend http://127.0.0.1:5173/ → HTTP $FE"
fi

if [[ "$BE" == "200" ]]; then
  green "✓ Backend  http://127.0.0.1:3000/health → HTTP $BE"
else
  red "✗ Backend  http://127.0.0.1:3000/health → HTTP $BE"
fi

if [[ -f "$LOG_DIR/frontend.log" ]]; then
  echo ""
  echo "Recent frontend log:"
  tail -3 "$LOG_DIR/frontend.log" 2>/dev/null || true
fi
if [[ -f "$LOG_DIR/backend.log" ]]; then
  echo ""
  echo "Recent backend log:"
  tail -3 "$LOG_DIR/backend.log" 2>/dev/null || true
fi

echo ""
if [[ "$FE" == "200" && "$BE" == "200" ]]; then
  green "Site is up. Open: http://localhost:5173/login"
  echo "Staff login: chair / Blujet@1404"
  echo "Cursor Cloud: forward port 5173 (frontend), not 3000 (API)."
else
  yellow "Site is NOT fully up. Try: ./scripts/start-local.sh"
  echo "If you use Cursor Cloud Agent, forward port 5173 (NOT 3000) in the Ports tab."
fi
