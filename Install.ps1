<#
    Ear2Finger - Windows installer
    -------------------------------
    Installs everything needed to run the web app (npm run web:dev):
      - Node.js LTS (user-scoped via winget, if missing)
      - Root + frontend npm dependencies (+ esbuild native binary)
      - Python virtual environment under backend\ + requirements.txt

    Usage (from the project root):
        powershell -ExecutionPolicy Bypass -File .\Install.ps1

    Optional:
        -Run    Start the web app when the install finishes.
#>

[CmdletBinding()]
param(
    [switch]$Run
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root

function Write-Step($msg) { Write-Host "`n=== $msg ===" -ForegroundColor Cyan }
function Write-Ok($msg)   { Write-Host "  [OK] $msg" -ForegroundColor Green }

# --- Resolve a working `node` / `npm` -------------------------------------
function Resolve-Node {
    $node = Get-Command node -ErrorAction SilentlyContinue
    if ($node) { return (Split-Path -Parent $node.Source) }

    # Common winget user-scoped install location
    $found = Get-ChildItem "$env:LOCALAPPDATA\Microsoft\WinGet\Packages" -Recurse -Filter node.exe -ErrorAction SilentlyContinue |
             Select-Object -First 1
    if ($found) { return $found.DirectoryName }
    return $null
}

Write-Step "Checking Node.js"
$nodeDir = Resolve-Node
if (-not $nodeDir) {
    Write-Host "  Node.js not found - installing LTS via winget (user scope, no admin)..." -ForegroundColor Yellow
    if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
        throw "winget is not available. Install Node.js 18+ manually from https://nodejs.org and re-run this script."
    }
    winget install OpenJS.NodeJS.LTS --scope user --accept-source-agreements --accept-package-agreements --silent -e
    $nodeDir = Resolve-Node
    if (-not $nodeDir) { throw "Node.js install completed but node.exe could not be located." }
}
# Put Node on PATH for this session
$env:Path = "$nodeDir;$env:Path"
Write-Ok "Node $(node --version) / npm $(npm --version)  ($nodeDir)"

# --- Resolve Python -------------------------------------------------------
Write-Step "Checking Python"
$pythonCmd = $null
foreach ($c in @('python', 'py')) {
    if (Get-Command $c -ErrorAction SilentlyContinue) { $pythonCmd = $c; break }
}
if (-not $pythonCmd) {
    throw "Python 3.8+ not found. Install it from https://www.python.org/downloads/ (check 'Add to PATH') and re-run."
}
Write-Ok "Python $(& $pythonCmd --version 2>&1)"

# --- Root npm install -----------------------------------------------------
Write-Step "Installing root dependencies"
npm install
Write-Ok "root node_modules ready"

# --- Frontend npm install + esbuild native binary -------------------------
Write-Step "Installing frontend dependencies"
Push-Location "$root\frontend"
npm install
$esbuildInstall = ".\node_modules\esbuild\install.js"
if (Test-Path $esbuildInstall) {
    # npm's script policy can skip esbuild's postinstall; run it so Vite gets its native binary
    node $esbuildInstall
}
Pop-Location
Write-Ok "frontend node_modules ready"

# --- Backend venv + requirements -----------------------------------------
Write-Step "Setting up Python backend"
Push-Location "$root\backend"
if (-not (Test-Path ".\venv\Scripts\python.exe")) {
    & $pythonCmd -m venv venv
}
$venvPy = ".\venv\Scripts\python.exe"
& $venvPy -m pip install --upgrade pip
& $venvPy -m pip install -r requirements.txt
Pop-Location
Write-Ok "backend venv ready"

Write-Host "`nInstall complete." -ForegroundColor Green
Write-Host "Start the web app with:  npm run web:dev   (opens http://127.0.0.1:3000)"
Write-Host "Note: FFmpeg is required for YouTube MP3 import (https://ffmpeg.org/download.html)."

if ($Run) {
    Write-Step "Starting web app (Ctrl+C to stop)"
    npm run web:dev
}
