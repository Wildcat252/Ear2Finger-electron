<#
    Ear2Finger - run the web app
    ----------------------------
    Starts the FastAPI backend (port 8000) and Vite frontend (port 3000)
    via `npm run web:dev`, then serves at http://127.0.0.1:3000.

    Usage (from the project root):
        powershell -ExecutionPolicy Bypass -File .\Run-Web.ps1

    Run Install.ps1 first if dependencies are not set up yet.
#>

[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root

# --- Ensure `node` / `npm` are on PATH ------------------------------------
function Resolve-Node {
    $node = Get-Command node -ErrorAction SilentlyContinue
    if ($node) { return (Split-Path -Parent $node.Source) }

    # winget user-scoped install location
    $found = Get-ChildItem "$env:LOCALAPPDATA\Microsoft\WinGet\Packages" -Recurse -Filter node.exe -ErrorAction SilentlyContinue |
             Select-Object -First 1
    if ($found) { return $found.DirectoryName }
    return $null
}

$nodeDir = Resolve-Node
if (-not $nodeDir) {
    throw "Node.js not found. Run Install.ps1 first (or install Node 18+ from https://nodejs.org)."
}
$env:Path = "$nodeDir;$env:Path"

# --- Sanity checks --------------------------------------------------------
if (-not (Test-Path "$root\node_modules")) {
    throw "Dependencies missing. Run Install.ps1 (or Install.cmd) first."
}
if (-not (Test-Path "$root\backend\venv\Scripts\python.exe")) {
    throw "Backend venv missing. Run Install.ps1 (or Install.cmd) first."
}

Write-Host "Starting Ear2Finger web app..." -ForegroundColor Cyan
Write-Host "  Frontend: http://127.0.0.1:3000" -ForegroundColor Green
Write-Host "  Backend:  http://127.0.0.1:8000" -ForegroundColor Green
Write-Host "  Press Ctrl+C to stop.`n"

npm run web:dev
