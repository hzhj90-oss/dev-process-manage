param([switch]$IncludeCrashSimulation)
$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
$Watchdog = Join-Path $PSScriptRoot 'service-watchdog.ps1'
$BrowserStart = Join-Path $PSScriptRoot 'start-browser-runner.ps1'
$BrowserStop = Join-Path $PSScriptRoot 'stop-browser-runner.ps1'
$PidFile = Join-Path $Root 'logs\browser-runner.pid'
$PauseFile = Join-Path $Root '.local\watchdog-browser-runner.paused'
$ScriptPath = Join-Path $Root 'runner\browser-runner\runner.mjs'

function Assert-Condition([bool]$condition, [string]$message) {
    if (-not $condition) { throw $message }
}
function Is-BrowserRunning([int]$ident) {
    if ($ident -lt 1) { return $false }
    $process = Get-CimInstance Win32_Process -Filter "ProcessId=$ident" -ErrorAction SilentlyContinue
    return [bool]($process -and $process.Name -eq 'node.exe' -and
        $process.CommandLine.IndexOf($ScriptPath,[StringComparison]::OrdinalIgnoreCase) -ge 0)
}
function Read-BrowserPid {
    if (-not (Test-Path -LiteralPath $PidFile)) { return 0 }
    $value = 0
    [void][int]::TryParse((Get-Content -LiteralPath $PidFile -Raw).Trim(),[ref]$value)
    return $value
}

& $Watchdog -DryRun
Write-Host 'WATCHDOG_READ_ONLY_CHECK_PASS'
if (-not $IncludeCrashSimulation) { return }

# Explicit test opt-in is required because this stops one local test Runner.
$taskResponse = Invoke-RestMethod 'http://127.0.0.1:18090/api/execution-tasks?status=RUNNING&pageNum=1&pageSize=1' -TimeoutSec 7
Assert-Condition ($taskResponse.total -eq 0) 'Cannot stop Browser Runner while a task is running.'
$old = Read-BrowserPid
Assert-Condition (Is-BrowserRunning $old) 'Browser Runner is not currently running.'
Assert-Condition (-not (Test-Path -LiteralPath $PauseFile)) 'Browser Runner was already manually paused.'

try {
    & $BrowserStop
    Assert-Condition (Test-Path -LiteralPath $PauseFile) 'Manual stop did not mark service as paused.'
    & $Watchdog -Repair -Services browser-runner
    Assert-Condition (-not (Is-BrowserRunning $old)) 'Watchdog restarted an intentionally stopped Runner.'
    Write-Host 'WATCHDOG_MANUAL_STOP_PRESERVED_PASS'

    & $BrowserStart
    $current = Read-BrowserPid
    Assert-Condition (Is-BrowserRunning $current) 'Explicit Runner restart failed.'
    Assert-Condition (-not (Test-Path -LiteralPath $PauseFile)) 'Explicit start did not clear pause marker.'

    # Simulate an unplanned crash only for this exact verified local runner.
    Stop-Process -Id $current -Force
    Start-Sleep -Seconds 2
    Assert-Condition (-not (Is-BrowserRunning $current)) 'Simulated crash did not stop Browser Runner.'
    & $Watchdog -Repair -Services browser-runner
    $recovered = Read-BrowserPid
    Assert-Condition ($recovered -ne $current -and (Is-BrowserRunning $recovered)) 'Watchdog did not restart crashed Browser Runner.'
    Write-Host "WATCHDOG_CRASH_RECOVERY_PASS old=$current new=$recovered"

    # A stale PID must be repaired by adopting the existing process, not spawning another.
    Set-Content -LiteralPath $PidFile -Value 999999 -Encoding ASCII
    & $Watchdog -Repair -Services browser-runner
    Assert-Condition ((Read-BrowserPid) -eq $recovered) 'Stale PID file was not repaired.'
    Assert-Condition (Is-BrowserRunning $recovered) 'PID adoption changed the running process.'
    Write-Host 'WATCHDOG_STALE_PID_ADOPTION_PASS'
} finally {
    $recordedPid = Read-BrowserPid
    if (-not (Is-BrowserRunning $recordedPid)) {
        # Never leave the test Runner intentionally stopped after an incomplete test.
        Remove-Item -LiteralPath $PidFile -Force -ErrorAction SilentlyContinue
        & $BrowserStart
    }
}
