#!/bin/zsh

# Launch Ear2Finger in the browser only — no Electron window.
# Same backend and database as the desktop app. Assumes setup is done
# (run Start.command first if not).

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
echo "   Ear2Finger — web only"
echo "========================================="

cd "$PROJECT_DIR" || fail "Could not enter project directory: $PROJECT_DIR"

# Fast sanity check: if setup is missing, point to Start.command instead of
# crashing mid-launch with a confusing npm/python error.
if [ ! -x "$PROJECT_DIR/backend/venv/bin/python" ] || \
   [ ! -d "$PROJECT_DIR/frontend/node_modules" ]; then
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
echo "Starting servers — your browser will open at http://127.0.0.1:3000"
echo "Keep this window open while using the app; press Ctrl+C here to stop."
echo ""
npm run web:dev

# Keep the terminal open so the reason for closing is visible.
echo ""
echo "Ear2Finger web servers have stopped."
echo "Press any key to close this window..."
read -k 1 -s
