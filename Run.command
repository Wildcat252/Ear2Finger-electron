#!/bin/zsh

# Quick launcher for repeat runs — assumes setup is already done
# (backend/venv, frontend/node_modules, and root node_modules exist).
# For the first run (installs everything), use Start.command instead.

PROJECT_DIR="${0:A:h}"

# Double-click launches get a sparse PATH; add common Node/Homebrew paths.
export PATH="/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"

# Print an error, keep the window open, and exit.
fail() {
    echo ""
    echo "ERROR: $1"
    echo ""
    echo "Press any key to exit..."
    read -k 1 -s
    exit 1
}

echo "========================================="
echo "   Running Ear2Finger..."
echo "========================================="

cd "$PROJECT_DIR" || fail "Could not enter project directory: $PROJECT_DIR"

# Fast sanity check: if setup is missing, point to Start.command instead of
# crashing mid-launch with a confusing npm/python error.
if [ ! -x "$PROJECT_DIR/backend/venv/bin/python" ] || \
   [ ! -d "$PROJECT_DIR/frontend/node_modules" ] || \
   [ ! -d "$PROJECT_DIR/node_modules/electron" ]; then
    fail "Setup is incomplete. Double-click Start.command first — it installs everything."
fi

# Free stale ports (uvicorn on 8000, Vite on 3000) from a previous run.
for port in 8000 3000; do
    pids=$(lsof -ti "tcp:$port" 2>/dev/null)
    if [ -n "$pids" ]; then
        echo "Port $port in use — stopping leftover process (PID: $pids)..."
        kill $pids 2>/dev/null
        sleep 1
        pids=$(lsof -ti "tcp:$port" 2>/dev/null)
        [ -n "$pids" ] && kill -9 $pids 2>/dev/null && sleep 1
    fi
done

echo ""
echo "Launching Ear2Finger..."
echo ""
npm run electron:dev

# Keep the terminal open so the reason for closing is visible.
echo ""
echo "Ear2Finger has closed."
echo "Logs: ~/Library/Application Support/ear2finger/ (startup.log, uvicorn.log)"
echo "Press any key to close this window..."
read -k 1 -s
