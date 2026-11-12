param([switch]$IncludeCorruptionTest)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'database-backup-common.ps1')
$root = Get-BackupDataRoot
$recent = @(Get-ChildItem -LiteralPath $root -Directory |
    Where-Object { $_.Name -match '^backup-\d{8}_\d{6}_\d{3}$' } |
    Sort-Object Name -Descending | Select-Object -First 1)
if (-not $recent.Count) { throw 'No completed backup available for the integrity test.' }
& (Join-Path $PSScriptRoot 'verify-database-backup.ps1') -BackupPath $recent[0].FullName
if (-not $IncludeCorruptionTest) { return }

$testPath = Join-Path $root ('.corruption-test-' + [guid]::NewGuid().ToString('N'))
try {
    Copy-Item -LiteralPath $recent[0].FullName -Destination $testPath -Recurse -Force
    $file = Join-Path $testPath 'database.sql.gz'
    $stream = [IO.File]::Open($file,[IO.FileMode]::Open,[IO.FileAccess]::ReadWrite)
    try {
        $stream.Position = 50
        $original = $stream.ReadByte()
        if ($original -lt 0) { throw 'Truncated test archive.' }
        $stream.Position = 50
        $stream.WriteByte([byte]($original -bxor 0x01))
    } finally { $stream.Dispose() }
    $preference = $ErrorActionPreference
    try {
        $ErrorActionPreference = 'Continue'
        & powershell.exe -NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'verify-database-backup.ps1') -BackupPath $testPath 2>&1 | Out-Null
        $exit = $LASTEXITCODE
    } finally { $ErrorActionPreference = $preference }
    if ($exit -eq 0) { throw 'Tampered SQL backup was incorrectly accepted.' }
    Write-Host 'BACKUP_CORRUPTION_REJECTED_PASS'
} finally {
    if (Test-Path -LiteralPath $testPath) {
        Remove-Item -LiteralPath $testPath -Force -Recurse
    }
}
