#!/usr/bin/env bash
# Wallet76 — Dev session startup script
# Usage: bash scripts/start_dev.sh
# Runs health check + quick build verification, then starts both servers.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Wallet76 — Dev session startup"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# 1. Health check — abort if critical errors
echo "▶ Health check…"
if ! python scripts/health.py; then
  echo ""
  echo "✗ Health check failed. Run:  python scripts/health.py --fix"
  echo "  Then re-run this script."
  exit 1
fi

# 2. Quick syntax check of frontend (craco build --no-emit would be ideal
#    but is slow; instead we use babel to parse changed JSX files only)
echo "▶ Syntax check on changed frontend files…"
CHANGED_JSX=$(git diff --name-only HEAD 2>/dev/null | grep -E "\.(jsx?|tsx?)$" || true)
if [ -n "$CHANGED_JSX" ]; then
  for f in $CHANGED_JSX; do
    if [ -f "$f" ]; then
      npx --yes acorn --ecma2020 --module "$f" > /dev/null 2>&1 \
        || node --input-type=module < "$f" > /dev/null 2>&1 \
        || echo "  ⚠ Possible syntax issue in $f — check before serving"
    fi
  done
else
  echo "  · No changed JSX files"
fi
echo ""

# 3. predev — abort early if port 8001 is already taken (e.g. a previous
#    uvicorn still running), instead of letting a second instance fail
#    silently or conflict with the first one.
echo "▶ A verificar porta 8001 (backend)…"
if ! python scripts/check_port.py 8001; then
  echo ""
  echo "✗ Não é possível arrancar: a porta 8001 já está ocupada."
  exit 1
fi
echo ""

# 4. Start backend + frontend in parallel
echo "▶ Starting backend (port 8001) and frontend (port 3000)…"
echo ""

# Activate venv if it exists
if [ -d "$ROOT/backend/venv" ]; then
  source "$ROOT/backend/venv/bin/activate"
elif [ -d "$ROOT/venv" ]; then
  source "$ROOT/venv/bin/activate"
fi

# Start backend
cd "$ROOT/backend"
uvicorn server:app --reload --port 8001 &
BACKEND_PID=$!

# Start frontend
cd "$ROOT/frontend"
BROWSER=none npx craco start &
FRONTEND_PID=$!

echo ""
echo "  Backend PID:  $BACKEND_PID  →  http://localhost:8001"
echo "  Frontend PID: $FRONTEND_PID  →  http://localhost:3000"
echo ""
echo "  Press Ctrl+C to stop both servers."
echo ""

# Wait and clean up on exit
trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; echo ''; echo 'Servers stopped.'" EXIT INT TERM
wait
