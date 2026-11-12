param([switch]$DryRun)
$ErrorActionPreference = 'Stop'
$TaskName = 'DPM-DevProcessManager-DatabaseBackup'
$task = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if (-not $task) {
    Write-Host 'DATABASE_BACKUP_TASK_NOT_INSTALLED'
    return
}
if ($DryRun) {
    Write-Host ('DATABASE_BACKUP_UNINSTALL_DRY_RUN name=' + $TaskName)
    return
}
Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction Stop
if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
    throw 'Could not verify scheduled backup task removal.'
}
Write-Host 'DATABASE_BACKUP_TASK_REMOVED; backups and services were not touched.'
