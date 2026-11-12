$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
# An intentional stop must not be undone by the periodic watchdog.
$PauseFile = Join-Path $Root '.local\watchdog-node-runner.paused'
Set-Content -LiteralPath $PauseFile -Value 'manual-stop' -Encoding ASCII
$PidFile = Join-Path $Root 'logs\node-runner.pid'
if (-not (Test-Path $PidFile)) { Write-Host 'Node Runner is not running.'; exit 0 }

$runnerPid = 0
[void][int]::TryParse((Get-Content -LiteralPath $PidFile -Raw).Trim(), [ref]$runnerPid)
if ($runnerPid -le 0) { Remove-Item -LiteralPath $PidFile -Force; throw 'Node Runner PID file is invalid.' }
$process = Get-CimInstance Win32_Process -Filter "ProcessId=$runnerPid" -ErrorAction SilentlyContinue
if ($process) {
    if ($process.CommandLine -notlike '*node-runner*runner.mjs*') {
        throw "PID $runnerPid is not the Node Runner; refusing to stop it."
    }
    Stop-Process -Id $runnerPid -Force
    Write-Host "Node Runner stopped. PID=$runnerPid"
} else {
    Write-Host 'Node Runner process was already stopped.'
}
Remove-Item -LiteralPath $PidFile -Force -ErrorAction SilentlyContinue
