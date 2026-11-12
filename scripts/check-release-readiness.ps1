param([switch]$Strict)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'release-common.ps1')
$project = $script:DpmReleaseProjectRoot
$jar = $script:DpmReleaseJar
Assert-DpmExecutableJar $jar
$sha = Get-DpmReleaseSha $jar
$health = Invoke-RestMethod -Uri 'http://127.0.0.1:18090/api/health' -TimeoutSec 8
if ($health.status -ne 'UP') { throw 'Backend is not healthy.' }
$running = Get-DpmRunningTaskCount
if ($running -ne 0) { throw "Cannot deploy: $running active execution tasks." }
Write-Host ('RELEASE_HEALTH=UP RUNNING_TASKS='+$running)

$expected = @{
    application=(Join-Path $project 'backend\target\dev-process-manager.jar')
    'http-runner'=(Join-Path $project 'runner\http-runner\runner.mjs')
    'node-runner'=(Join-Path $project 'runner\node-runner\runner.mjs')
    'browser-runner'=(Join-Path $project 'runner\browser-runner\runner.mjs')
}
$processes = @(Get-CimInstance Win32_Process -ErrorAction Stop)
foreach ($name in @('application','http-runner','node-runner','browser-runner')) {
    $match = @($processes | Where-Object {
        $exeValid = if ($name -eq 'application') {
            $_.Name -match '^javaw?\.exe$'
        } else { $_.Name -eq 'node.exe' }
        $exeValid -and $_.CommandLine -and
            $_.CommandLine.IndexOf($expected[$name],[StringComparison]::OrdinalIgnoreCase) -ge 0
    })
    Write-Host ('RELEASE_PROCESS_'+$name+'='+$match.Count)
    if ($match.Count -ne 1) { throw "Expected exactly one instance of $name." }
}
$listeners = @(Get-NetTCPConnection -State Listen -LocalPort 18090 -ErrorAction Stop)
if ($listeners.Count -ne 1 -or $listeners[0].LocalAddress -notin @('127.0.0.1','::1')) {
    throw 'Application port is not uniquely bound to loopback; unauthenticated exposure refused.'
}
Write-Host ('RELEASE_NETWORK_BIND='+$listeners[0].LocalAddress+':18090')

foreach ($label in @('DPM-DevProcessManager-Watchdog','DPM-DevProcessManager-DatabaseBackup')) {
    $task = Get-ScheduledTask -TaskName $label -ErrorAction Stop
    $action = $task.Actions[0]
    if (-not $action.Execute.EndsWith('wscript.exe',[StringComparison]::OrdinalIgnoreCase)) {
        throw "Scheduled task is not windowless: $label"
    }
    Write-Host ('RELEASE_SCHEDULED_TASK='+$label+' STATE='+$task.State)
}
$ps = Join-Path $env:WINDIR 'System32\WindowsPowerShell\v1.0\powershell.exe'
& $ps -NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'backup-status.ps1') -Verify
if ($LASTEXITCODE -ne 0) { throw 'Latest database and upload backup was not verified.' }
$snapshots = @(Get-ChildItem -LiteralPath $script:DpmReleaseSnapshotRoot -Directory -ErrorAction Stop |
    Where-Object { $_.Name -cmatch '^release-[0-9]{8}_[0-9]{6}_[0-9]{3}$' } |
    Sort-Object Name -Descending)
if (-not $snapshots.Count) { throw 'No verified release rollback snapshot exists.' }
$old = Read-DpmReleaseSnapshot $snapshots[0].Name
Write-Host ('RELEASE_ROLLBACK_SNAPSHOT='+$old.Name)
Write-Host ('RELEASE_ROLLBACK_SHA256='+$old.Manifest.sha256)
Write-Host ('RELEASE_CURRENT_SHA256='+$sha)
# A snapshot of some older release is not enough: the currently deployed
# binary must also have a verified recovery copy before future upgrades.
$liveSnapshot = if ($old.Manifest.sha256 -ceq $sha) { $old } else { $null }
if (-not $liveSnapshot) {
    foreach ($item in $snapshots | Select-Object -Skip 1) {
        try {
            $candidate = Read-DpmReleaseSnapshot $item.Name
            if ($candidate.Manifest.sha256 -ceq $sha) { $liveSnapshot = $candidate; break }
        } catch { continue }
    }
}
if (-not $liveSnapshot) {
    throw 'Current deployment JAR lacks a matching verified release snapshot.'
}
Write-Host ('RELEASE_CURRENT_RECOVERY_SNAPSHOT='+$liveSnapshot.Name)
$free = (New-Object IO.DriveInfo([IO.Path]::GetPathRoot($jar))).AvailableFreeSpace
if ($free -lt 536870912) { throw 'Less than 512 MiB of local disk space remains.' }
Write-Host ('RELEASE_DISK_FREE_BYTES='+$free)

# Unlike git diff --check, this also inspects every untracked source file
# individually. Source cleanliness remains a separate release decision.
$node = (Get-Command node -ErrorAction Stop).Source
$auditArgs = @((Join-Path $PSScriptRoot 'audit-release-worktree.mjs'))
if ($Strict) { $auditArgs += '--strict' }
& $node @auditArgs
if ($LASTEXITCODE -ne 0) { throw 'Source worktree file hygiene or strict release gate failed.' }

$changes = @(& git -C $project status --short)
if ($LASTEXITCODE -ne 0) { throw 'Git worktree status not available.' }
Write-Host ('RELEASE_UNCOMMITTED_PATHS='+$changes.Count)
# Windows PowerShell 5.1 wraps native git stderr warnings as error records.
# Read git's actual exit code; do not mistake LF/CRLF hints for diff failures.
$previousPreference = $ErrorActionPreference
try {
    $ErrorActionPreference = 'Continue'
    & git -C $project diff --check 2>$null | Out-Null
    $diffExit = $LASTEXITCODE
} finally { $ErrorActionPreference = $previousPreference }
if ($diffExit -ne 0) { throw 'Git whitespace conflict check failed.' }
if ($Strict -and $changes.Count -ne 0) {
    throw "Strict release requires clean Git worktree, found $($changes.Count) paths."
}
Write-Host ('RELEASE_READINESS_PASS=true STRICT='+[bool]$Strict+' WRITES=0')
