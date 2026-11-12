param([switch]$Force,[switch]$DryRun)
$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
$Watchdog = Join-Path $PSScriptRoot 'service-watchdog.ps1'
$TaskName = 'DPM-DevProcessManager-Watchdog'
$ScriptHost = Join-Path $env:WINDIR 'System32\wscript.exe'
$Wrapper = Join-Path $PSScriptRoot 'service-watchdog-hidden.vbs'
if (-not (Test-Path $Watchdog) -or -not (Test-Path $ScriptHost) -or -not (Test-Path $Wrapper)) {
    throw 'Watchdog or windowless Windows Script Host wrapper is missing.'
}

# Run under the currently logged-in Windows user. No stored credentials.
$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = New-ScheduledTaskPrincipal -UserId $identity.Name -LogonType Interactive -RunLevel Limited
$minuteTrigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 1) -RepetitionDuration (New-TimeSpan -Days 3650)
$logonTrigger = New-ScheduledTaskTrigger -AtLogOn -User $identity.Name
# wscript.exe is a GUI-subsystem executable. Unlike PowerShell.exe, it
# never briefly displays a console before -WindowStyle Hidden is processed.
$arguments = '//B //NoLogo "' + $Wrapper + '"'
$action = New-ScheduledTaskAction -Execute $ScriptHost -Argument $arguments -WorkingDirectory $Root
$settings = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Minutes 2)
$task = New-ScheduledTask -Action $action -Trigger @($minuteTrigger,$logonTrigger) -Principal $principal -Settings $settings -Description 'Local DPM process watchdog; never replays test cases.'

$existing = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if ($DryRun) {
    Write-Host ('WATCHDOG_TASK_DRY_RUN name='+$TaskName+' user='+$identity.Name+' exists='+[bool]$existing)
    Write-Host 'Triggers: on logon; every minute for ten years while signed in.'
    return
}
if ($existing -and -not $Force) {
    throw 'Watchdog task is already installed. Refusing replacement unless -Force is specified.'
}
Register-ScheduledTask -TaskName $TaskName -InputObject $task -Force:$Force -ErrorAction Stop | Out-Null
$registered = Get-ScheduledTask -TaskName $TaskName -ErrorAction Stop
if (-not $registered -or $registered.Actions[0].Execute -ne $ScriptHost -or
    $registered.Actions[0].Arguments -notlike ('*' + $Wrapper + '*')) {
    throw 'Task registration could not be verified.'
}
Write-Host ('WATCHDOG_TASK_INSTALLED '+$TaskName+' status='+$registered.State)
Write-Host 'Only this logged-in user is used. Watchdog does not replay interrupted test cases.'
