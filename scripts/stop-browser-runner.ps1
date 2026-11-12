$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
# An intentional stop must not be undone by the periodic watchdog.
$PauseFile = Join-Path $Root '.local\watchdog-browser-runner.paused'
Set-Content -LiteralPath $PauseFile -Value 'manual-stop' -Encoding ASCII
$PidFile = Join-Path $Root 'logs\browser-runner.pid'
if (-not (Test-Path $PidFile)) { Write-Host 'Browser Runner is not running.'; exit 0 }

$runnerPid = 0
[void][int]::TryParse((Get-Content -LiteralPath $PidFile -Raw).Trim(), [ref]$runnerPid)
if ($runnerPid -le 0) { Remove-Item -LiteralPath $PidFile -Force; throw 'Browser Runner PID file is invalid.' }
$process = Get-CimInstance Win32_Process -Filter "ProcessId=$runnerPid" -ErrorAction SilentlyContinue
if ($process) {
    if ($process.CommandLine -notlike '*browser-runner*runner.mjs*') {
        throw "PID $runnerPid is not the Browser Runner; refusing to stop it."
    }
    Stop-Process -Id $runnerPid -Force
    Write-Host "Browser Runner stopped. PID=$runnerPid"
} else {
    Write-Host 'Browser Runner process was already stopped.'
}
Remove-Item -LiteralPath $PidFile -Force -ErrorAction SilentlyContinue
