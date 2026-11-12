param([switch]$DryRun)
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'release-common.ps1')
. (Join-Path $PSScriptRoot 'database-backup-common.ps1')
$jar = $script:DpmReleaseJar
$root = $script:DpmReleaseSnapshotRoot
$mutex = New-Object Threading.Mutex($false,'Local\DPM-ReleaseSnapshot')
$held = $false
$stage = $null
try {
    try { $held = $mutex.WaitOne(0) }
    catch [Threading.AbandonedMutexException] { $held = $true }
    if (-not $held) { throw 'Another release snapshot operation is in progress.' }
    Assert-DpmExecutableJar $jar
    $original = Assert-DpmRegularFile $jar
    $before = Get-DpmReleaseSha $jar
    $active = Get-DpmRunningTaskCount
    $health = Invoke-RestMethod -Uri 'http://127.0.0.1:18090/api/health' -TimeoutSec 8
    if ($health.status -ne 'UP') { throw 'Cannot snapshot a backend without a healthy response.' }
    if ($active -ne 0) { throw "Cannot capture a deployment baseline while $active execution tasks run." }
    Write-Host ('RELEASE_SOURCE_SHA256='+$before+' BYTES='+$original.Length)
    if ($DryRun) { Write-Host 'RELEASE_SNAPSHOT_DRY_RUN=true'; return }
    if (-not (Test-Path -LiteralPath $root)) {
        [void](New-Item -ItemType Directory -Path $root -Force)
    }
    $rootInfo = Get-Item -LiteralPath $root -Force
    if (($rootInfo.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
        throw 'Release snapshot root must not be a symlink.'
    }
    Protect-BackupDirectory $root
    $stamp = (Get-Date).ToUniversalTime().ToString('yyyyMMdd_HHmmss_fff')
    $name = 'release-'+$stamp
    Assert-DpmSnapshotName $name
    $target = Join-Path $root $name
    if (Test-Path -LiteralPath $target) { throw 'Snapshot name collision.' }
    $stage = Join-Path $root ('.staging-'+[guid]::NewGuid().ToString('N'))
    [void](New-Item -ItemType Directory -Path $stage)
    Protect-BackupDirectory $stage
    $copy = Join-Path $stage 'application.jar'
    Copy-Item -LiteralPath $jar -Destination $copy -ErrorAction Stop
    $copyHash = Get-DpmReleaseSha $copy
    if ($copyHash -cne $before -or (Get-DpmReleaseSha $jar) -cne $before) {
        throw 'Application JAR changed during snapshot; refusing inconsistent release.'
    }
    Assert-DpmExecutableJar $copy
    $gitHead = (& git -C $script:DpmReleaseProjectRoot rev-parse HEAD)
    if ($LASTEXITCODE -ne 0) { throw 'Cannot resolve Git revision.' }
    $changed = @(& git -C $script:DpmReleaseProjectRoot status --short).Count
    $manifest = [ordered]@{
        formatVersion=1; snapshotName=$name
        createdAtUtc=[DateTime]::UtcNow.ToString('o')
        artifactFile='application.jar'; sha256=$copyHash
        bytes=(Get-Item -LiteralPath $copy).Length
        gitHead=([string]$gitHead).Trim()
        dirtyPaths=$changed; runningTasksAtCapture=$active
    }
    $utf8 = New-Object Text.UTF8Encoding($false)
    [IO.File]::WriteAllText((Join-Path $stage 'manifest.json'),
        ($manifest | ConvertTo-Json -Depth 5),$utf8)
    Move-Item -LiteralPath $stage -Destination $target -ErrorAction Stop
    $stage = $null
    $verified = Read-DpmReleaseSnapshot $name
    Write-Host ('RELEASE_SNAPSHOT_READY='+$verified.Name)
    Write-Host ('RELEASE_SNAPSHOT_SHA256='+$verified.Manifest.sha256)
    Write-Host ('RELEASE_GIT_HEAD='+$verified.Manifest.gitHead+' DIRTY_PATHS='+$changed)
} finally {
    if ($stage -and (Test-Path -LiteralPath $stage)) {
        Remove-Item -LiteralPath $stage -Force -Recurse -ErrorAction SilentlyContinue
    }
    if ($held) { $mutex.ReleaseMutex() }
    $mutex.Dispose()
}
