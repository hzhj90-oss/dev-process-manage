param([switch]$Verify)
$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
$TaskName = 'DPM-DevProcessManager-DatabaseBackup'
$task = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if (-not $task) {
    Write-Host 'DATABASE_BACKUP_TASK=NOT_INSTALLED'
} else {
    $taskInfo = Get-ScheduledTaskInfo -TaskName $TaskName
    Write-Host ('DATABASE_BACKUP_TASK=' + $task.State)
    $action = $task.Actions[0]
    $wrapper = Join-Path $PSScriptRoot 'scheduled-backup-hidden.vbs'
    $windowless = $action.Execute.EndsWith('wscript.exe',[StringComparison]::OrdinalIgnoreCase) -and
        $action.Arguments.Contains($wrapper)
    Write-Host ('BACKUP_WINDOWLESS_LAUNCH=' + $windowless)
    Write-Host ('TASK_LAST_RESULT=' + $taskInfo.LastTaskResult)
    Write-Host ('TASK_LAST_RUN=' + $taskInfo.LastRunTime.ToString('yyyy-MM-dd HH:mm:ss'))
    Write-Host ('TASK_NEXT_RUN=' + $taskInfo.NextRunTime.ToString('yyyy-MM-dd HH:mm:ss'))
}
$backupRoot = Join-Path $Root 'data\backup\automatic'
$backups = @()
if (Test-Path -LiteralPath $backupRoot) {
    $backups = @(Get-ChildItem -LiteralPath $backupRoot -Directory |
        Where-Object { $_.Name -match '^backup-\d{8}_\d{6}_\d{3}$' } |
        Sort-Object Name -Descending)
}
Write-Host ('COMPLETED_BACKUPS=' + $backups.Count)
if ($backups.Count -eq 0) {
    Write-Host 'LATEST_BACKUP=NONE'
    exit 2
}
$latest = $backups[0]
$manifestFile = Join-Path $latest.FullName 'manifest.json'
if (-not (Test-Path -LiteralPath $manifestFile)) {
    Write-Host 'LATEST_BACKUP_MANIFEST=MISSING'
    exit 2
}
$manifest = [IO.File]::ReadAllText($manifestFile) | ConvertFrom-Json
$created = [datetime]::Parse($manifest.createdAtUtc).ToUniversalTime()
$hours = [Math]::Round(([DateTime]::UtcNow - $created).TotalHours,1)
Write-Host ('LATEST_BACKUP=' + $latest.FullName)
Write-Host ('LATEST_AGE_HOURS=' + $hours)
Write-Host ('LATEST_TABLES=' + $manifest.databaseTableCount +
    ' LATEST_UPLOAD_FILES=' + $manifest.uploadFileCount)
if ($Verify) {
    & (Join-Path $PSScriptRoot 'verify-database-backup.ps1') -BackupPath $latest.FullName
}
if ($hours -gt 48) {
    Write-Host 'BACKUP_FRESHNESS=STALE'
    exit 2
}
Write-Host 'BACKUP_FRESHNESS=OK'
