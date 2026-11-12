param(
    [string]$SnapshotName,
    [switch]$Apply,
    [string]$ExpectedSha256,
    [switch]$AllowOffline
)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'release-common.ps1')
$root = $script:DpmReleaseSnapshotRoot
$liveJar = $script:DpmReleaseJar
$ps = Join-Path $env:WINDIR 'System32\WindowsPowerShell\v1.0\powershell.exe'

if ($Apply) {
    if ($env:DPM_RELEASE_ROLLBACK_APPROVE -cne 'YES' -or
        [string]::IsNullOrWhiteSpace($SnapshotName) -or
        $ExpectedSha256 -cnotmatch '^[a-f0-9]{64}$') {
        throw 'Apply requires an exact snapshot ID, SHA-256 and DPM_RELEASE_ROLLBACK_APPROVE=YES.'
    }
}
if ([string]::IsNullOrWhiteSpace($SnapshotName)) {
    $candidates = @(Get-ChildItem -LiteralPath $root -Directory -ErrorAction Stop |
        Where-Object { $_.Name -cmatch '^release-[0-9]{8}_[0-9]{6}_[0-9]{3}$' } |
        Sort-Object Name -Descending)
    if (-not $candidates.Count) { throw 'No official release snapshots found.' }
    $SnapshotName = $candidates[0].Name
}
$snapshot = Read-DpmReleaseSnapshot $SnapshotName
if ($Apply -and $snapshot.Manifest.sha256 -cne $ExpectedSha256) {
    throw 'Explicit expected SHA-256 does not match the verified snapshot.'
}
$offline = $false
if ($AllowOffline) {
    $listeners = @(Get-NetTCPConnection -LocalPort 18090 -State Listen -ErrorAction SilentlyContinue)
    $activeJava = @(Get-CimInstance Win32_Process -ErrorAction Stop | Where-Object {
        $_.Name -match '^javaw?\.exe$' -and $_.CommandLine -and
        $_.CommandLine.IndexOf($liveJar,[StringComparison]::OrdinalIgnoreCase) -ge 0
    })
    if ($listeners.Count -ne 0 -or $activeJava.Count -ne 0) {
        throw 'Offline restore requires a fully stopped backend and unoccupied port 18090.'
    }
    $offline = $true
}
if (-not $offline) {
    Assert-DpmExecutableJar $liveJar
    $beforeHash = Get-DpmReleaseSha $liveJar
    $active = Get-DpmRunningTaskCount
    $health = Invoke-RestMethod -Uri 'http://127.0.0.1:18090/api/health' -TimeoutSec 8
    if ($health.status -ne 'UP') { throw 'Refusing live rollback without a healthy backend.' }
} else {
    $beforeHash = if (Test-Path -LiteralPath $liveJar -PathType Leaf) {
        Assert-DpmExecutableJar $liveJar
        Get-DpmReleaseSha $liveJar
    } else { '' }
    $active = 'UNKNOWN_OFFLINE'
}
Write-Host ('ROLLBACK_SNAPSHOT='+$snapshot.Name)
Write-Host ('ROLLBACK_TARGET_SHA256='+$snapshot.Manifest.sha256)
Write-Host ('ROLLBACK_CURRENT_SHA256='+$beforeHash)
Write-Host ('ROLLBACK_ACTIVE_TASKS='+$active)
if (-not $Apply) {
    Write-Host 'ROLLBACK_MODE=READ_ONLY_PREVIEW; NO SERVICE OR FILE CHANGES'
    return
}
Assert-DpmRollbackTaskGuard -Offline $offline -ActiveCount $active
if ($beforeHash -ceq $snapshot.Manifest.sha256) {
    throw 'Selected snapshot equals current JAR; refusing an unnecessary service restart.'
}
# After successful rollback the displaced binary is cleaned up. Require a
# separate, verified snapshot of it so a later forward recovery remains possible.
$previousSaved = $false
foreach ($folder in @(Get-ChildItem -LiteralPath $root -Directory |
        Where-Object { $_.Name -cmatch '^release-[0-9]{8}_[0-9]{6}_[0-9]{3}$' })) {
    try {
        $verified = Read-DpmReleaseSnapshot $folder.Name
        if ($verified.Manifest.sha256 -ceq $beforeHash) { $previousSaved=$true; break }
    } catch { continue }
}
if ($beforeHash -and -not $previousSaved) {
    throw 'Current JAR has no verified restore snapshot. Run create-release-snapshot.ps1 first.'
}

$mutex = New-Object Threading.Mutex($false,'Local\DPM-ReleaseRollback')
$held = $false
$marker = Join-Path $script:DpmReleaseProjectRoot '.local\watchdog.paused'
$alreadyPaused = Test-Path -LiteralPath $marker
$pauseCreated = $false
$ready = $false
$recovered = $false
$stopped = $false
$workId = [guid]::NewGuid().ToString('N')
$incoming = $liveJar+'.incoming-'+$workId
$previous = $liveJar+'.previous-'+$workId
try {
    try { $held = $mutex.WaitOne(0) }
    catch [Threading.AbandonedMutexException] { $held = $true }
    if (-not $held) { throw 'Another release rollback is in progress.' }
    if ($beforeHash -and (Get-DpmReleaseSha $liveJar) -cne $beforeHash) {
        throw 'Current deployment changed since preview; no changes made.'
    }
    # Prepare and checksum the replacement before stopping any process.
    Copy-Item -LiteralPath $snapshot.Jar -Destination $incoming -ErrorAction Stop
    if ((Get-DpmReleaseSha $incoming) -cne $snapshot.Manifest.sha256) {
        throw 'Prepared rollback JAR failed integrity validation.'
    }
    if (-not $alreadyPaused) {
        [IO.File]::WriteAllText($marker,'release-rollback',[Text.Encoding]::ASCII)
        $pauseCreated = $true
    }
    if (-not $offline) {
        if ((Get-DpmRunningTaskCount) -ne 0) {
            throw 'A task started during rollback preparation; refusing to stop.'
        }
        Set-Location $script:DpmReleaseProjectRoot
        & $ps -NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'stop.ps1')
        if ($LASTEXITCODE -ne 0) { throw 'Controlled backend stop failed.' }
        $stopped = $true
    } else {
        # Service was already stopped: no API, database or task mutation.
        # Verify the port is still unoccupied before swapping the offline JAR.
        $lateListener = @(Get-NetTCPConnection -LocalPort 18090 -State Listen -ErrorAction SilentlyContinue)
        $lateJava = @(Get-CimInstance Win32_Process -ErrorAction Stop | Where-Object {
            $_.Name -match '^javaw?\.exe$' -and $_.CommandLine -and
            $_.CommandLine.IndexOf($liveJar,[StringComparison]::OrdinalIgnoreCase) -ge 0
        })
        if ($lateListener.Count -ne 0 -or $lateJava.Count -ne 0) {
            throw 'Backend process or port appeared during offline restore; no swap allowed.'
        }
        $stopped = $true
    }
    if (Get-NetTCPConnection -LocalPort 18090 -State Listen -ErrorAction SilentlyContinue) {
        throw 'Port 18090 is still occupied after stop; refusing to replace JAR.'
    }
    if ($beforeHash) {
        Invoke-DpmVerifiedJarSwap $liveJar $incoming $previous $beforeHash $snapshot.Manifest.sha256
    } else {
        Move-Item -LiteralPath $incoming -Destination $liveJar -ErrorAction Stop
        if ((Get-DpmReleaseSha $liveJar) -cne $snapshot.Manifest.sha256) {
            throw 'Offline restored JAR checksum mismatch.'
        }
    }
    & $ps -NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'start.ps1') -SkipBuild
    if ($LASTEXITCODE -ne 0) { throw 'Rollback JAR did not start healthy.' }
    $after = Invoke-RestMethod -Uri 'http://127.0.0.1:18090/api/health' -TimeoutSec 8
    if ($after.status -ne 'UP') { throw 'Health check after rollback failed.' }
    $ready = $true
    Write-Host ('ROLLBACK_APPLIED='+$snapshot.Name+' HEALTH=UP')
} catch {
    $problem = $_.Exception.Message
    if ($stopped) {
        try {
            # Restore the previous JAR if any stage after shutdown failed.
            & $ps -NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'stop.ps1') | Out-Null
            if (Get-NetTCPConnection -LocalPort 18090 -State Listen -ErrorAction SilentlyContinue) {
                throw 'Unexpected listener prevents automatic recovery.'
            }
            if (Test-Path -LiteralPath $previous -PathType Leaf) {
                Restore-DpmPreviousJar $liveJar $previous $beforeHash
            }
            if (-not $beforeHash -or (Get-DpmReleaseSha $liveJar) -cne $beforeHash) {
                throw 'No recoverable previous JAR; leave watchdog paused for manual repair.'
            }
            & $ps -NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'start.ps1') -SkipBuild
            if ($LASTEXITCODE -ne 0) { throw 'Original JAR restart failed.' }
            $recovered = $true
            Write-Host 'ROLLBACK_FAILED_BUT_ORIGINAL_SERVICE_RECOVERED=true'
        } catch {
            Write-Host ('ROLLBACK_EMERGENCY=Service may be stopped. Keep watchdog paused. '+$_.Exception.Message)
        }
    }
    throw ('Release rollback aborted: '+$problem)
} finally {
    if (Test-Path -LiteralPath $incoming) {
        Remove-Item -LiteralPath $incoming -Force -ErrorAction SilentlyContinue
    }
    if ($ready -and (Test-Path -LiteralPath $previous)) {
        Remove-Item -LiteralPath $previous -Force -ErrorAction SilentlyContinue
    }
    if ($pauseCreated -and ($ready -or $recovered -or -not $stopped)) {
        Remove-Item -LiteralPath $marker -Force -ErrorAction SilentlyContinue
    }
    if ($held) { $mutex.ReleaseMutex() }
    $mutex.Dispose()
}
