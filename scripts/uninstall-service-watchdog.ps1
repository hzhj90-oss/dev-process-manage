param([switch]$DryRun)
$ErrorActionPreference = 'Stop'
$TaskName = 'DPM-DevProcessManager-Watchdog'
$task = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if (-not $task) {
    Write-Host 'WATCHDOG_TASK_NOT_INSTALLED'
    return
}
if ($DryRun) {
    Write-Host ('WATCHDOG_UNINSTALL_DRY_RUN name=' + $TaskName)
    return
}
Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction Stop
if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
    throw 'Task removal could not be verified.'
}
Write-Host 'WATCHDOG_TASK_REMOVED; the four existing services were not stopped.'
