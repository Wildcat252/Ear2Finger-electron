#!/bin/zsh

# First-time setup + launch for Ear2Finger.
# Installs anything that's missing (backend venv, Python deps, npm packages),
# then starts the app. After the first successful run, use Run.command for
# faster launches that skip the setup steps.

# ${0:A:h} resolves to this script's own directory, so the launcher works
# no matter where the repository is cloned or moved.
PROJECT_DIR="${0:A:h}"

# Double-click launches get a sparse PATH; add common Node/Homebrew paths.
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

echo "========================================="
echo "   Ear2Finger — first-time setup"
echo "========================================="
echo "Project directory: $PROJECT_DIR"
echo ""

cd "$PROJECT_DIR" || fail "Could not enter project directory: $PROJECT_DIR"

# --- Required tools ---------------------------------------------------------
command -v node >/dev/null 2>&1 || \
    fail "Node.js is not installed (or not on PATH). Install it from https://nodejs.org and try again."

command -v npm >/dev/null 2>&1 || \
    fail "npm is not found on PATH. Make sure Node.js is installed correctly."

command -v python3 >/dev/null 2>&1 || \
    fail "python3 is not installed (or not on PATH). Install it from https://python.org and try again."

# --- Backend: venv + Python dependencies ------------------------------------
VENV_PY="$PROJECT_DIR/backend/venv/bin/python"

if [ ! -x "$VENV_PY" ]; then
    echo "Creating backend virtual environment..."
    python3 -m venv "$PROJECT_DIR/backend/venv" || fail "Could not create the backend virtual environment."
fi

if ! ( cd "$PROJECT_DIR/backend" && "$VENV_PY" -c "import main" >/dev/null 2>&1 ); then
    echo "Installing backend Python dependencies (this can take a few minutes)..."
    "$VENV_PY" -m pip install -U pip >/dev/null || fail "Could not upgrade pip in the backend venv."
    "$VENV_PY" -m pip install -r "$PROJECT_DIR/backend/requirements.txt" || \
        fail "Backend dependency install failed. Scroll up for the pip error."
fi

# --- Root npm packages (Electron) --------------------------------------------
if ! node -e "require('fs').accessSync(require('electron'))" >/dev/null 2>&1; then
    echo "Installing Electron and root npm packages..."
    npm install || fail "npm install failed in the project root. Scroll up for the error."
fi

# --- Frontend npm packages ----------------------------------------------------
if [ ! -d "$PROJECT_DIR/frontend/node_modules" ]; then
    echo "Installing frontend npm packages..."
    npm install --prefix "$PROJECT_DIR/frontend" || \
        fail "npm install failed in frontend/. Scroll up for the error."
fi

# --- Free stale ports so a relaunch never crashes on a bound port ------------
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

# --- Launch -------------------------------------------------------------------
echo ""
echo "Setup complete. Launching Ear2Finger (first start can take ~10-20 seconds)..."
echo "Next time, double-click Run.command for a faster launch."
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
