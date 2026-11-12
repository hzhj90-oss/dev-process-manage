# Local-only verified binary release snapshots. This module never reads DB credentials.
$script:DpmReleaseProjectRoot = Split-Path -Parent $PSScriptRoot
$script:DpmReleaseSnapshotRoot = Join-Path $script:DpmReleaseProjectRoot 'data\release-snapshots'
$script:DpmReleaseJar = Join-Path $script:DpmReleaseProjectRoot 'backend\target\dev-process-manager.jar'
Add-Type -AssemblyName System.IO.Compression.FileSystem

function Get-DpmReleaseSha([string]$Path) {
    $stream = [IO.File]::OpenRead($Path)
    $sha = [Security.Cryptography.SHA256]::Create()
    try { return ([BitConverter]::ToString($sha.ComputeHash($stream))).Replace('-','').ToLowerInvariant() }
    finally { $stream.Dispose(); $sha.Dispose() }
}

function Assert-DpmRegularFile([string]$Path) {
    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { throw "Required release artifact is missing." }
    $file = Get-Item -LiteralPath $Path -Force
    if (($file.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
        throw 'Refusing a reparse point or symlink as a release artifact.'
    }
    if ($file.Length -lt 1024) { throw 'Release artifact is unexpectedly small.' }
    return $file
}

function Assert-DpmExecutableJar([string]$Path) {
    [void](Assert-DpmRegularFile $Path)
    $zip = [IO.Compression.ZipFile]::OpenRead($Path)
    $manifest = $false
    $classes = $false
    try {
        foreach ($entry in $zip.Entries) {
            if ($entry.FullName -eq 'META-INF/MANIFEST.MF') { $manifest = $true }
            if ($entry.FullName -match '^BOOT-INF/classes/.+\.class$') { $classes = $true }
            if ($manifest -and $classes) { break }
        }
    } finally { $zip.Dispose() }
    if (-not ($manifest -and $classes)) { throw 'JAR has no Spring Boot main classes or manifest.' }
}

function Assert-DpmSnapshotName([string]$Name) {
    if ($Name -cnotmatch '^release-[0-9]{8}_[0-9]{6}_[0-9]{3}$') {
        throw 'Invalid snapshot ID (expected release-YYYYMMDD_HHMMSS_mmm).'
    }
}

function Read-DpmReleaseSnapshot([string]$Name,[string]$RootPath=$script:DpmReleaseSnapshotRoot) {
    Assert-DpmSnapshotName $Name
    $root = [IO.Path]::GetFullPath($RootPath).TrimEnd('\')
    $folder = Join-Path $root $Name
    if (-not (Test-Path -LiteralPath $folder -PathType Container)) { throw 'Snapshot folder does not exist.' }
    foreach ($directory in @($root,$folder)) {
        $item = Get-Item -LiteralPath $directory -Force
        if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
            throw 'Refusing release directory symlink/reparse point.'
        }
    }
    $manifestPath = Join-Path $folder 'manifest.json'
    if (-not (Test-Path -LiteralPath $manifestPath -PathType Leaf)) {
        throw 'Release manifest missing.'
    }
    $m = [IO.File]::ReadAllText($manifestPath) | ConvertFrom-Json
    if ($m.formatVersion -ne 1 -or $m.snapshotName -cne $Name -or
        [string]$m.artifactFile -cne 'application.jar' -or
        ([string]$m.sha256) -cnotmatch '^[a-f0-9]{64}$' -or
        [long]$m.bytes -lt 1024) { throw 'Release manifest has invalid metadata.' }
    $jar = Join-Path $folder 'application.jar'
    $file = Assert-DpmRegularFile $jar
    if ($file.Length -ne [long]$m.bytes) { throw 'Release artifact length mismatch.' }
    if ((Get-DpmReleaseSha $jar) -cne [string]$m.sha256) {
        throw 'Release artifact checksum mismatch.'
    }
    Assert-DpmExecutableJar $jar
    return @{ Name=$Name; Path=$folder; Jar=$jar; Manifest=$m }
}

function Get-DpmRunningTaskCount {
    $response = Invoke-RestMethod -Uri 'http://127.0.0.1:18090/api/execution-tasks?status=RUNNING&pageNum=1&pageSize=1' -TimeoutSec 8
    if ($null -eq $response.total -or ([string]$response.total) -notmatch '^\d+$') {
        throw 'Task API returned an invalid running-task count.'
    }
    return [long]$response.total
}

# All three artifacts must live in the same application target directory.
# The service must already be stopped by the caller; this function starts no process.
function Invoke-DpmVerifiedJarSwap([string]$Current,[string]$Incoming,[string]$Previous,
        [string]$OldSha,[string]$NewSha) {
    $directory = [IO.Path]::GetDirectoryName([IO.Path]::GetFullPath($Current))
    foreach ($path in @($Incoming,$Previous)) {
        if (-not [IO.Path]::GetDirectoryName([IO.Path]::GetFullPath($path)).Equals(
                $directory,[StringComparison]::OrdinalIgnoreCase)) {
            throw 'Release swap files must remain on the same filesystem directory.'
        }
    }
    if (Test-Path -LiteralPath $Previous) { throw 'Previous binary destination already exists.' }
    [void](Assert-DpmRegularFile $Current)
    [void](Assert-DpmRegularFile $Incoming)
    if ((Get-DpmReleaseSha $Current) -cne $OldSha -or
        (Get-DpmReleaseSha $Incoming) -cne $NewSha) {
        throw 'Release swap source checksum mismatch before modifying any files.'
    }
    Move-Item -LiteralPath $Current -Destination $Previous -ErrorAction Stop
    try {
        Move-Item -LiteralPath $Incoming -Destination $Current -ErrorAction Stop
        if ((Get-DpmReleaseSha $Current) -cne $NewSha) {
            throw 'Release swap destination checksum mismatch.'
        }
    } catch {
        if (Test-Path -LiteralPath $Current) {
            Remove-Item -LiteralPath $Current -Force -ErrorAction Stop
        }
        Move-Item -LiteralPath $Previous -Destination $Current -ErrorAction Stop
        throw
    }
}

function Restore-DpmPreviousJar([string]$Current,[string]$Previous,[string]$ExpectedSha) {
    [void](Assert-DpmRegularFile $Previous)
    if ((Get-DpmReleaseSha $Previous) -cne $ExpectedSha) {
        throw 'Original binary checksum mismatch; refusing destructive recovery.'
    }
    $failedBinary = $Current+'.failed-'+[guid]::NewGuid().ToString('N')
    $movedBad = $false
    if (Test-Path -LiteralPath $Current) {
        Move-Item -LiteralPath $Current -Destination $failedBinary -ErrorAction Stop
        $movedBad = $true
    }
    try {
        Move-Item -LiteralPath $Previous -Destination $Current -ErrorAction Stop
        if ((Get-DpmReleaseSha $Current) -cne $ExpectedSha) {
            throw 'Original binary failed post-restore checksum.'
        }
    } catch {
        if ($movedBad -and -not (Test-Path -LiteralPath $Current)) {
            Move-Item -LiteralPath $failedBinary -Destination $Current -ErrorAction SilentlyContinue
        }
        throw
    }
    # Leave the failed candidate in the ignored backend target directory for review.
}

# Offline rollback has no running-task API by definition. It is allowed only
# when the caller has independently verified both process absence and free port.
# Unknown online task count must fail closed instead of being treated as zero.
function Assert-DpmRollbackTaskGuard([bool]$Offline,[object]$ActiveCount) {
    if ($Offline) {
        if ([string]$ActiveCount -cne 'UNKNOWN_OFFLINE') {
            throw 'Offline rollback must use the explicit offline task marker.'
        }
        return
    }
    if ($null -eq $ActiveCount -or
        ([string]$ActiveCount) -notmatch '^\d+$' -or
        [long]$ActiveCount -ne 0) {
        throw 'Active or unknown execution tasks block online rollback.'
    }
}
