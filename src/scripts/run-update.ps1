# scripts\run-update.ps1
# Wrapper for Task Scheduler: set env vars and run Node updater
# Edit the SOCRATA_APP_TOKEN or prefer using a secure secret file.

# Optional: load environment variables from .env if you have one
$envFile = Join-Path $PSScriptRoot '..\.env'
if (Test-Path $envFile) {
  Get-Content $envFile | ForEach-Object {
    if ($_ -match '^\s*([^#][^=]+)=(.*)$') {
      $k = $matches[1].Trim()
      $v = $matches[2].Trim()
      $env:$k = $v
    }
  }
}

# Directly set token here if you must (not recommended for public repos)
 $env:SOCRATA_APP_TOKEN = process.env.SOCRATA_APP_TOKEN || '';

# Ensure we run from the repo root
$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot

# Create logs folder
$logDir = Join-Path $repoRoot 'logs'
if (!(Test-Path $logDir)) { New-Item -ItemType Directory -Path $logDir | Out-Null }

# Run the updater and log output
$ts = (Get-Date).ToString('yyyyMMdd-HHmmss')
$logFile = Join-Path $logDir "update-$ts.log"

Write-Output "Running update at $(Get-Date) — logging to $logFile"
node src/scripts/update-bus-speeds.js *>&1 | Tee-Object -FilePath $logFile
# exit with node's exit code (if any)
