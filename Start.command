#!/bin/zsh

# Change directory to the project folder.
# ${0:A:h} resolves to this script's own directory, so the launcher works
# no matter where the repository is cloned or moved.
PROJECT_DIR="${0:A:h}"

echo "========================================="
echo "   Starting Ear2Finger..."
echo "========================================="
echo "Project directory: $PROJECT_DIR"
echo ""

# Add common Node/Homebrew paths (double-click launches with a sparse PATH).
export PATH="/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"

# Print an error, keep the window open, and exit. Accepts multi-line messages.
fail() {
    echo ""
    echo "ERROR: $1"
    echo ""
    echo "Press any key to exit..."
    read -k 1 -s
    exit 1
}

# --- Ensure we're in the right directory -----------------------------------
if [ -d "$PROJECT_DIR" ]; then
    cd "$PROJECT_DIR" || fail "Could not enter project directory: $PROJECT_DIR"
else
    fail "Project directory not found at $PROJECT_DIR"
fi

# --- Pre-flight checks (clear messages instead of a silent crash) ----------
command -v node >/dev/null 2>&1 || \
    fail "Node.js is not installed (or not on PATH). Install it from https://nodejs.org and try again."

command -v npm >/dev/null 2>&1 || \
    fail "npm is not found on PATH. Make sure Node.js is installed correctly."

VENV_PY="$PROJECT_DIR/backend/venv/bin/python"
if [ ! -x "$VENV_PY" ]; then
    fail "Backend virtual environment is missing (backend/venv).
Set it up once:
  cd \"$PROJECT_DIR/backend\"
  python3 -m venv venv
  source venv/bin/activate
  pip install -r requirements.txt"
fi

echo "Checking backend dependencies..."
if ! ( cd "$PROJECT_DIR/backend" && "$VENV_PY" -c "import main" >/dev/null 2>&1 ); then
    fail "The backend can't start — its Python dependencies are not fully installed.
Fix it:
  cd \"$PROJECT_DIR/backend\"
  source venv/bin/activate
  pip install -r requirements.txt"
fi

if [ ! -d "$PROJECT_DIR/frontend/node_modules" ]; then
    fail "Frontend dependencies are missing.
Install them:
  npm install --prefix \"$PROJECT_DIR/frontend\""
fi

if [ ! -d "$PROJECT_DIR/node_modules/electron" ]; then
    fail "Electron is not installed.
Install it from the project root:
  cd \"$PROJECT_DIR\" && npm install"
fi

# --- Free stale ports so a relaunch never crashes on a bound port ----------
# electron:dev starts uvicorn on 8000 and Vite on 3000. If a previous run's
# servers are still alive, the new uvicorn fails to bind and the whole launch
# tears down instantly. Stop anything left on those ports first.
for port in 8000 3000; do
    pids=$(lsof -ti "tcp:$port" 2>/dev/null)
    if [ -n "$pids" ]; then
        echo "Port $port is already in use — stopping the leftover process (PID: $pids)..."
        kill $pids 2>/dev/null
        sleep 1
        pids=$(lsof -ti "tcp:$port" 2>/dev/null)
        if [ -n "$pids" ]; then
            kill -9 $pids 2>/dev/null
            sleep 1
        fi
    fi
done

# --- Launch -----------------------------------------------------------------
echo ""
echo "Launching Ear2Finger (first start can take ~10-20 seconds)..."
echo ""
npm run electron:dev

# If it crashes or stops, keep the terminal open so the reason is visible.
echo ""
echo "========================================="
echo "   Ear2Finger has closed."
echo "========================================="
echo "If it failed to start, check the logs in:"
echo "  ~/Library/Application Support/ear2finger/  (startup.log, uvicorn.log)"
echo ""
echo "Press any key to close this window..."
read -k 1 -s
