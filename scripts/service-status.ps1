$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
$TaskName = 'DPM-DevProcessManager-Watchdog'
$task = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if (-not $task) {
    Write-Host 'WATCHDOG_TASK=NOT_INSTALLED'
} else {
    $info = Get-ScheduledTaskInfo -TaskName $TaskName -ErrorAction Stop
    Write-Host ('WATCHDOG_TASK=' + $task.State)
    $action = $task.Actions[0]
    $wrapper = Join-Path $PSScriptRoot 'service-watchdog-hidden.vbs'
    $windowless = $action.Execute.EndsWith('wscript.exe',[StringComparison]::OrdinalIgnoreCase) -and
        $action.Arguments.Contains($wrapper)
    Write-Host ('WATCHDOG_WINDOWLESS_LAUNCH=' + $windowless)
    Write-Host ('LAST_RUN=' + $info.LastRunTime.ToString('yyyy-MM-dd HH:mm:ss'))
    Write-Host ('LAST_RESULT=' + $info.LastTaskResult)
    Write-Host ('NEXT_RUN=' + $info.NextRunTime.ToString('yyyy-MM-dd HH:mm:ss'))
}
$globalPause = Test-Path -LiteralPath (Join-Path $Root '.local\watchdog.paused')
Write-Host ('GLOBAL_MAINTENANCE_PAUSED=' + $globalPause)
$services = @{
    application = 'backend\target\dev-process-manager.jar'
    'http-runner' = 'runner\http-runner\runner.mjs'
    'node-runner' = 'runner\node-runner\runner.mjs'
    'browser-runner' = 'runner\browser-runner\runner.mjs'
}
$running = @(Get-CimInstance Win32_Process -ErrorAction Stop)
foreach ($name in @('application','http-runner','node-runner','browser-runner')) {
    $expected = Join-Path $Root $services[$name]
    $matches = @($running | Where-Object {
        $correctExe = if ($name -eq 'application') {
            $_.Name -match '^javaw?\.exe$'
        } else { $_.Name -eq 'node.exe' }
        $correctExe -and $_.CommandLine -and
            $_.CommandLine.IndexOf($expected,[StringComparison]::OrdinalIgnoreCase) -ge 0
    })
    $file = Join-Path $Root ('logs\' + $name + '.pid')
    $recorded = 0
    if (Test-Path -LiteralPath $file) {
        [void][int]::TryParse((Get-Content -LiteralPath $file -Raw).Trim(),[ref]$recorded)
    }
    $manualPause = Test-Path (Join-Path $Root ('.local\watchdog-' + $name + '.paused'))
    $actual = if ($matches.Count -eq 1) { $matches[0].ProcessId } else { 'none' }
    Write-Host ($name + ' processes=' + $matches.Count +
        ' actualPid=' + $actual + ' recordedPid=' + $recorded + ' manuallyPaused=' + $manualPause)
}
try {
    $health = Invoke-RestMethod -Uri 'http://127.0.0.1:18090/api/health' -TimeoutSec 3
    Write-Host ('BACKEND_HEALTH=' + $health.status)
} catch { Write-Host 'BACKEND_HEALTH=UNREACHABLE' }
Write-Host ('WATCHDOG_LOG=' + (Join-Path $Root 'logs\service-watchdog.log'))
