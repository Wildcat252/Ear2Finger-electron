#!/usr/bin/env bash
#
# Launch Ear2Finger in the browser only — no Electron window.
# Same backend and database as the desktop app.
#
# Usage:  ./run-web.sh        (from a terminal, macOS or Linux)
# Stop:   Ctrl+C
#
# First-time setup (creates the venv, installs deps) is done by the
# double-click launchers Start.command / Web.command on macOS, or run the
# steps in README.md on Linux.

set -euo pipefail

# Resolve this script's own directory so it works from anywhere.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

fail() { echo "" >&2; echo "ERROR: $1" >&2; exit 1; }

echo "========================================="
echo "   Ear2Finger — web only"
echo "========================================="

# Locate the backend Python: Windows-style Scripts dir first, then Unix.
if [ -x "$SCRIPT_DIR/backend/venv/Scripts/python.exe" ]; then
    BACKEND_PY="$SCRIPT_DIR/backend/venv/Scripts/python.exe"
elif [ -x "$SCRIPT_DIR/backend/venv/bin/python" ]; then
    BACKEND_PY="$SCRIPT_DIR/backend/venv/bin/python"
else
    BACKEND_PY=""
fi

if [ -z "$BACKEND_PY" ] || [ ! -d "$SCRIPT_DIR/frontend/node_modules" ]; then
    fail "Setup is incomplete. On macOS double-click Start.command; otherwise create backend/venv, pip install -r backend/requirements.txt, and npm install --prefix frontend."
fi

# Free stale ports (uvicorn on 8000, Vite on 3000) from a previous run.
free_port() {
    local port="$1" pids
    if command -v lsof >/dev/null 2>&1; then
        pids="$(lsof -ti "tcp:$port" 2>/dev/null || true)"
    elif command -v fuser >/dev/null 2>&1; then
        pids="$(fuser "$port"/tcp 2>/dev/null || true)"
    else
        return 0
    fi
    if [ -n "${pids:-}" ]; then
        echo "Port $port in use — stopping leftover process ($pids)..."
        # shellcheck disable=SC2086
        kill $pids 2>/dev/null || true
        sleep 1
        # shellcheck disable=SC2086
        kill -9 $pids 2>/dev/null || true
    fi
}
free_port 8000
free_port 3000

echo ""
echo "Starting servers — your browser will open at http://127.0.0.1:3000"
echo "Press Ctrl+C to stop."
echo ""
exec npm run web:dev
