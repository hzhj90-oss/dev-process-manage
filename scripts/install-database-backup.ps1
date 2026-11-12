param([switch]$Force,[switch]$DryRun)
$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
$BackupScript = Join-Path $PSScriptRoot 'run-scheduled-backup.ps1'
$TaskName = 'DPM-DevProcessManager-DatabaseBackup'
$ScriptHost = Join-Path $env:WINDIR 'System32\wscript.exe'
$Wrapper = Join-Path $PSScriptRoot 'scheduled-backup-hidden.vbs'
if (-not (Test-Path $BackupScript) -or -not (Test-Path $ScriptHost) -or -not (Test-Path $Wrapper)) {
    throw 'Backup script or windowless Windows Script Host wrapper is missing.'
}
$user = [Security.Principal.WindowsIdentity]::GetCurrent().Name
$principal = New-ScheduledTaskPrincipal -UserId $user -LogonType Interactive -RunLevel Limited
$dailyTrigger = New-ScheduledTaskTrigger -Daily -At '02:30'
$logonTrigger = New-ScheduledTaskTrigger -AtLogOn -User $user
# Use a GUI-subsystem host to eliminate short-lived console flashes.
$argument = '//B //NoLogo "' + $Wrapper + '"'
$action = New-ScheduledTaskAction -Execute $ScriptHost -Argument $argument -WorkingDirectory $Root
$settings = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Hours 1)
$task = New-ScheduledTask -Action $action -Trigger @($dailyTrigger,$logonTrigger) -Principal $principal -Settings $settings -Description 'Daily local-only MySQL and attachment backup, with verification and retention.'
$existing = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if ($DryRun) {
    Write-Host ('DATABASE_BACKUP_TASK_DRY_RUN exists=' + [bool]$existing + ' user=' + $user)
    Write-Host 'Schedule: daily 02:30 Windows local time and on logon; skip if verified backup < 20h.'
    return
}
if ($existing -and -not $Force) {
    throw 'Backup task already exists; use -Force only after reviewing the task.'
}
Register-ScheduledTask -TaskName $TaskName -InputObject $task -Force:$Force -ErrorAction Stop | Out-Null
$actual = Get-ScheduledTask -TaskName $TaskName -ErrorAction Stop
if ($actual.Actions[0].Execute -ne $ScriptHost -or
    $actual.Actions[0].Arguments -notlike ('*' + $Wrapper + '*')) {
    throw 'Registered task executable does not match expected PowerShell.'
}
Write-Host ('DATABASE_BACKUP_TASK_INSTALLED name=' + $TaskName + ' state=' + $actual.State)
