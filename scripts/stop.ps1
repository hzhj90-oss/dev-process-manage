$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
# An intentional stop must not be undone by the periodic watchdog.
$PauseFile = Join-Path $Root '.local\watchdog-application.paused'
Set-Content -LiteralPath $PauseFile -Value 'manual-stop' -Encoding ASCII
$PidFile = Join-Path $Root 'logs\application.pid'

if (-not (Test-Path $PidFile)) {
    Write-Host 'PID file not found; application may already be stopped.'
    exit 0
}
$processId = [int](Get-Content -LiteralPath $PidFile -Raw)
$processInfo = Get-CimInstance Win32_Process -Filter "ProcessId = $processId" -ErrorAction SilentlyContinue
if (-not $processInfo) {
    Remove-Item -LiteralPath $PidFile -Force
    Write-Host 'Application process is not running.'
    exit 0
}
if ($processInfo.Name -notmatch '^javaw?\.exe$' -or $processInfo.CommandLine -notmatch 'dev-process-manager\.jar') {
    throw "PID $processId does not belong to dev-process-manager. Refusing to stop an unrelated process."
}
Stop-Process -Id $processId
Start-Sleep -Seconds 2
$processInfo = Get-CimInstance Win32_Process -Filter "ProcessId = $processId" -ErrorAction SilentlyContinue
if ($processInfo -and $processInfo.CommandLine -match 'dev-process-manager\.jar') {
    Stop-Process -Id $processId -Force
}
Remove-Item -LiteralPath $PidFile -Force -ErrorAction SilentlyContinue
Write-Host "Stopped dev-process-manager (PID $processId)."