#!/bin/zsh

# macOS double-click launcher — thin wrapper around run-web.sh so both entry
# points share one implementation. Launches Ear2Finger in the browser only
# (no Electron window), same backend and database as the desktop app.

# ${0:A:h} resolves to this script's own directory regardless of where it runs.
PROJECT_DIR="${0:A:h}"

# Double-click launches get a sparse PATH; add common Node/Homebrew paths.
export PATH="/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"

cd "$PROJECT_DIR" || { echo "Could not enter $PROJECT_DIR"; }

bash "$PROJECT_DIR/run-web.sh"

# Keep the Terminal window open after the servers stop so any error is visible.
echo ""
echo "Ear2Finger web servers have stopped."
echo "Press any key to close this window..."
read -k 1 -s
