$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
$TokenFile = Join-Path $Root '.local\runner-token.txt'
$RunnerScript = Join-Path $Root 'runner\http-runner\runner.mjs'
$PidFile = Join-Path $Root 'logs\http-runner.pid'
$Stdout = Join-Path $Root 'logs\http-runner.stdout.log'
$Stderr = Join-Path $Root 'logs\http-runner.stderr.log'

if (-not (Test-Path $TokenFile)) { throw 'Runner token not found. Start the application once with scripts\start.ps1 first.' }
if (-not (Test-Path $RunnerScript)) { throw "HTTP Runner script not found: $RunnerScript" }
$token = (Get-Content -LiteralPath $TokenFile -Raw).Trim()
if ($token.Length -lt 32) { throw 'Local Runner token is invalid.' }

try {
    $health = Invoke-RestMethod -Uri 'http://127.0.0.1:18090/api/health' -TimeoutSec 3
    if ($health.status -ne 'UP') { throw 'Health endpoint did not return UP.' }
} catch { throw 'Management application is not healthy. Start it with scripts\start.ps1 first.' }
if (Test-Path $PidFile) {
    $oldPid = 0
    [void][int]::TryParse((Get-Content -LiteralPath $PidFile -Raw).Trim(), [ref]$oldPid)
    if ($oldPid -gt 0) {
        $existing = Get-CimInstance Win32_Process -Filter "ProcessId=$oldPid" -ErrorAction SilentlyContinue
        if ($existing -and $existing.CommandLine -like '*runner.mjs*') {
            throw "HTTP Runner is already running. PID=$oldPid"
        }
    }
    Remove-Item -LiteralPath $PidFile -Force -ErrorAction SilentlyContinue
}

$Node = (Get-Command node -ErrorAction SilentlyContinue).Source
if (-not $Node) {
    $candidate = Join-Path $env:USERPROFILE 'Documents\ChatGPT\cw-others-work\DesktopCommander-Tunnel\node\node-v24.22.1-win-x64\node.exe'
    if (Test-Path $candidate) { $Node = $candidate }
}
if (-not $Node) { throw 'Node.js was not found. Install Node.js 20+ or add node.exe to PATH.' }

$env:DPM_RUNNER_TOKEN = $token
$process = Start-Process -FilePath $Node -ArgumentList @('"' + $RunnerScript + '"') `
    -WorkingDirectory $Root -WindowStyle Hidden -PassThru `
    -RedirectStandardOutput $Stdout -RedirectStandardError $Stderr
Set-Content -LiteralPath $PidFile -Value $process.Id -Encoding ASCII
Start-Sleep -Seconds 1
$process.Refresh()
if ($process.HasExited) {
    Remove-Item -LiteralPath $PidFile -Force -ErrorAction SilentlyContinue
    throw "HTTP Runner exited during startup. Check logs\http-runner.stderr.log."
}
# Explicit successful start re-enables watchdog recovery for this service.
Remove-Item -LiteralPath (Join-Path $Root '.local\watchdog-http-runner.paused') -Force -ErrorAction SilentlyContinue
Write-Host "HTTP Runner started. PID=$($process.Id)"
