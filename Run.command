#!/bin/zsh

# Quick launcher for repeat runs — assumes setup is already done
# (backend/venv, frontend/node_modules, and root node_modules exist).
# For a first run with setup checks, use Start_Ear2Finger.command instead.

PROJECT_DIR="${0:A:h}"
cd "$PROJECT_DIR" || { echo "Project not found: $PROJECT_DIR"; read -k 1 -s; exit 1; }

# Double-click launches get a sparse PATH; add common Node/Homebrew paths.
export PATH="/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"

echo "========================================="
echo "   Running Ear2Finger..."
echo "========================================="

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

echo ""
echo "Ear2Finger has closed."
echo "Logs: ~/Library/Application Support/ear2finger/ (startup.log, uvicorn.log)"
echo "Press any key to close this window..."
read -k 1 -s
