# Destructive tests are restricted to an isolated temporary folder.
# Never runs rollback -Apply against the real service.
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'release-common.ps1')
$project = $script:DpmReleaseProjectRoot
$before = Get-DpmReleaseSha $script:DpmReleaseJar
$health = Invoke-RestMethod 'http://127.0.0.1:18090/api/health' -TimeoutSec 8
if ($health.status -ne 'UP') { throw 'Backend not healthy before the test.' }
$active = Get-DpmRunningTaskCount
if ($active -ne 0) { throw 'Active tasks present; refusing test.' }
$root = $script:DpmReleaseSnapshotRoot
$recent = @(Get-ChildItem -LiteralPath $root -Directory |
    Where-Object { $_.Name -cmatch '^release-[0-9]{8}_[0-9]{6}_[0-9]{3}$' } |
    Sort-Object Name -Descending)
if (-not $recent.Count) { throw 'No snapshot for release safety test.' }
$source = Read-DpmReleaseSnapshot $recent[0].Name
$testRoot = Join-Path $project ('.local\release-test-'+[guid]::NewGuid().ToString('N'))
$fakeName = 'release-20991231_235959_999'
$fakeFolder = Join-Path $testRoot $fakeName
$ps = Join-Path $env:WINDIR 'System32\WindowsPowerShell\v1.0\powershell.exe'
$tests = 0
$hadApproval = Test-Path Env:DPM_RELEASE_ROLLBACK_APPROVE
$previousApproval = if ($hadApproval) { $env:DPM_RELEASE_ROLLBACK_APPROVE } else { '' }
try {
    [void](New-Item -ItemType Directory -Path $fakeFolder -Force)
    Copy-Item -LiteralPath $source.Jar -Destination (Join-Path $fakeFolder 'application.jar')
    $manifest = [IO.File]::ReadAllText((Join-Path $source.Path 'manifest.json')) | ConvertFrom-Json
    $manifest.snapshotName = $fakeName
    [IO.File]::WriteAllText((Join-Path $fakeFolder 'manifest.json'),
        ($manifest | ConvertTo-Json -Depth 5),([Text.UTF8Encoding]::new($false)))
    $verified = Read-DpmReleaseSnapshot $fakeName $testRoot
    if ($verified.Manifest.sha256 -cne $source.Manifest.sha256) {
        throw 'Temporary snapshot should match official source hash.'
    }
    $tests++
    foreach ($invalidName in @('..\escape','release-20261112_113442_631\..','release-evil')) {
        $rejected = $false
        try { [void](Read-DpmReleaseSnapshot $invalidName $testRoot) }
        catch { $rejected = $true }
        if (-not $rejected) { throw 'Unsafe snapshot ID was accepted.' }
        $tests++
    }
    $copy = Join-Path $fakeFolder 'application.jar'
    $stream = [IO.File]::Open($copy,[IO.FileMode]::Open,[IO.FileAccess]::ReadWrite)
    try {
        $stream.Position = 2000
        $byte = $stream.ReadByte()
        $stream.Position = 2000
        $stream.WriteByte([byte]($byte -bxor 1))
    } finally { $stream.Dispose() }
    $rejected = $false
    try { [void](Read-DpmReleaseSnapshot $fakeName $testRoot) }
    catch { if ($_.Exception.Message -match 'checksum') { $rejected=$true } }
    if (-not $rejected) { throw 'Tampered JAR was not refused.' }
    $tests++
    $env:DPM_RELEASE_ROLLBACK_APPROVE = ''
    # Windows PowerShell 5.1 treats native stderr as terminating under Stop.
    # Capture expected negative exit codes instead of turning them into test exceptions.
    $oldPreference = $ErrorActionPreference
    try {
        $ErrorActionPreference = 'Continue'
        & $ps -NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'rollback-release.ps1') -Apply -SnapshotName $source.Name -ExpectedSha256 $source.Manifest.sha256 2>$null | Out-Null
        $deniedNoApproval = $LASTEXITCODE
        $env:DPM_RELEASE_ROLLBACK_APPROVE = 'YES'
        & $ps -NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'rollback-release.ps1') -Apply -SnapshotName $source.Name -ExpectedSha256 ('0'*64) 2>$null | Out-Null
        $deniedWrongHash = $LASTEXITCODE
    } finally { $ErrorActionPreference = $oldPreference }
    if ($deniedNoApproval -eq 0) { throw 'Rollback without approval unexpectedly succeeded.' }
    $tests++
    if ($deniedWrongHash -eq 0) { throw 'Rollback with wrong target hash unexpectedly succeeded.' }
    $tests++
    $oldPreference = $ErrorActionPreference
    try {
        $ErrorActionPreference = 'Continue'
        & $ps -NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'rollback-release.ps1') -AllowOffline -SnapshotName $source.Name 2>$null | Out-Null
        $deniedLiveOffline = $LASTEXITCODE
    } finally { $ErrorActionPreference = $oldPreference }
    if ($deniedLiveOffline -eq 0) { throw 'Offline-only rollback unexpectedly accepted an active service.' }
    $tests++
    # Distinguish intentionally unknown offline task count from an unknown
    # online task state. The old shared comparison rejected ALL offline restores.
    Assert-DpmRollbackTaskGuard -Offline $true -ActiveCount 'UNKNOWN_OFFLINE'
    $tests++
    Assert-DpmRollbackTaskGuard -Offline $false -ActiveCount 0
    $tests++
    foreach ($badCount in @(1,'UNKNOWN_OFFLINE','not-a-count',-1)) {
        $reject = $false
        try { Assert-DpmRollbackTaskGuard -Offline $false -ActiveCount $badCount }
        catch { $reject = $true }
        if (-not $reject) { throw ('Unsafe online task count was accepted: '+$badCount) }
        $tests++
    }
    $rejectedWrongOffline = $false
    try { Assert-DpmRollbackTaskGuard -Offline $true -ActiveCount 0 }
    catch { $rejectedWrongOffline = $true }
    if (-not $rejectedWrongOffline) { throw 'Offline restore accepted an online task count marker.' }
    $tests++
    # Exercise the same file-swap helpers used after a real controlled stop,
    # but only against 2 KiB fixtures in .local; never touch the running JAR.
    $swapDir = Join-Path $testRoot 'offline-swap'
    [void](New-Item -ItemType Directory -Path $swapDir)
    $activeJar = Join-Path $swapDir 'active.jar'
    $incomingJar = Join-Path $swapDir 'incoming.jar'
    $previousJar = Join-Path $swapDir 'previous.jar'
    $oldBytes = New-Object byte[] 2048
    $newBytes = New-Object byte[] 2048
    for ($i=0; $i -lt 2048; $i++) { $oldBytes[$i]=17; $newBytes[$i]=35 }
    [IO.File]::WriteAllBytes($activeJar,$oldBytes)
    [IO.File]::WriteAllBytes($incomingJar,$newBytes)
    $oldHash = Get-DpmReleaseSha $activeJar
    $newHash = Get-DpmReleaseSha $incomingJar
    Invoke-DpmVerifiedJarSwap $activeJar $incomingJar $previousJar $oldHash $newHash
    if ((Get-DpmReleaseSha $activeJar) -cne $newHash -or
        (Get-DpmReleaseSha $previousJar) -cne $oldHash -or
        (Test-Path -LiteralPath $incomingJar)) {
        throw 'Offline release swap did not atomically preserve the previous artifact.'
    }
    $tests++
    Restore-DpmPreviousJar $activeJar $previousJar $oldHash
    if ((Get-DpmReleaseSha $activeJar) -cne $oldHash -or
        (Test-Path -LiteralPath $previousJar) -or
        @(Get-ChildItem -LiteralPath $swapDir -Filter 'active.jar.failed-*').Count -ne 1) {
        throw 'Offline recovery did not preserve original JAR and failed candidate.'
    }
    $tests++
    [IO.File]::WriteAllBytes($incomingJar,$newBytes)
    $wasRejected = $false
    try { Invoke-DpmVerifiedJarSwap $activeJar $incomingJar $previousJar $oldHash ('0'*64) }
    catch { $wasRejected = $true }
    if (-not $wasRejected -or (Get-DpmReleaseSha $activeJar) -cne $oldHash -or
        (Test-Path -LiteralPath $previousJar)) {
        throw 'Checksum rejection altered an active offline artifact.'
    }
    $tests++
    if ((Get-DpmReleaseSha $script:DpmReleaseJar) -cne $before -or
        (Invoke-RestMethod 'http://127.0.0.1:18090/api/health' -TimeoutSec 8).status -ne 'UP') {
        throw 'Live application changed during release safety tests.'
    }
    if ((Get-DpmRunningTaskCount) -ne 0) { throw 'Test unexpectedly created live tasks.' }
    Write-Host ('RELEASE_SAFETY_PASS cases='+$tests+' actualRollback=false backendWrites=0')
} finally {
    if ($hadApproval) { $env:DPM_RELEASE_ROLLBACK_APPROVE = $previousApproval }
    else { Remove-Item Env:DPM_RELEASE_ROLLBACK_APPROVE -ErrorAction SilentlyContinue }
    if (Test-Path -LiteralPath $testRoot) {
        Remove-Item -LiteralPath $testRoot -Recurse -Force -ErrorAction Stop
    }
}
