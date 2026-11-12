param([string]$BackupPath)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'database-backup-common.ps1')
Add-Type -AssemblyName System.IO.Compression.FileSystem
$root = [IO.Path]::GetFullPath((Get-BackupDataRoot))
if (-not (Test-Path -LiteralPath $root)) { throw 'No automatic database backup directory exists.' }
if ([string]::IsNullOrWhiteSpace($BackupPath)) {
    $backups = @(Get-ChildItem -LiteralPath $root -Directory |
        Where-Object { $_.Name -match '^backup-\d{8}_\d{6}_\d{3}$' } |
        Sort-Object Name -Descending)
    if ($backups.Count -eq 0) { throw 'There are no completed backups to validate.' }
    $BackupPath = $backups[0].FullName
}
$path = [IO.Path]::GetFullPath($BackupPath)
if (-not ([IO.Path]::GetDirectoryName($path)).Equals($root,[StringComparison]::OrdinalIgnoreCase)) {
    throw 'Only a direct child of the local automatic backup directory can be verified.'
}
if (-not (Test-Path -LiteralPath $path -PathType Container)) { throw 'Backup folder is missing.' }
$manifestFile = Join-Path $path 'manifest.json'
if (-not (Test-Path -LiteralPath $manifestFile)) { throw 'Backup manifest is missing.' }
$manifest = [IO.File]::ReadAllText($manifestFile) | ConvertFrom-Json
if ($manifest.formatVersion -ne 1 -or $manifest.database -ne $script:DatabaseName -or
    $manifest.databaseTableCount -lt 1 -or $manifest.uploadFileCount -lt 0) {
    throw 'Backup manifest has invalid metadata.'
}
foreach ($name in @('database.sql.gz','uploads.zip')) {
    $item = $manifest.files.PSObject.Properties[$name].Value
    $file = Join-Path $path $name
    if (-not $item -or -not (Test-Path -LiteralPath $file -PathType Leaf)) {
        throw "Backup payload missing: $name"
    }
    if ((Get-Item -LiteralPath $file).Length -ne [long]$item.bytes -or
        (Get-Sha256 $file) -ne [string]$item.sha256) {
        throw "Backup payload failed SHA-256/size validation: $name"
    }
}

# Read all compressed SQL, including the GZip trailer, rather than trusting file existence.
$compressedFile = [IO.File]::OpenRead((Join-Path $path 'database.sql.gz'))
$tables = 0
$dumpFooter = $false
$totalSqlChars = 0L
try {
    $gzip = [IO.Compression.GZipStream]::new($compressedFile,[IO.Compression.CompressionMode]::Decompress)
    try {
        $reader = [IO.StreamReader]::new($gzip,[Text.Encoding]::UTF8,$true,65536,$true)
        try {
            while (($line = $reader.ReadLine()) -ne $null) {
                $totalSqlChars += $line.Length
                if ($line.StartsWith('CREATE TABLE ')) { $tables++ }
                if ($line.StartsWith('-- Dump completed on')) { $dumpFooter = $true }
            }
        } finally { $reader.Dispose() }
    } finally { $gzip.Dispose() }
} finally { $compressedFile.Dispose() }
if (-not $dumpFooter -or $tables -ne [int]$manifest.databaseTableCount -or $totalSqlChars -lt 1024) {
    throw 'SQL decompression succeeded but schema/footer validation failed.'
}

$zip = [IO.Compression.ZipFile]::OpenRead((Join-Path $path 'uploads.zip'))
$files = 0
try {
    foreach ($entry in $zip.Entries) {
        $name = $entry.FullName.Replace('\','/')
        if ($name.StartsWith('/') -or $name.Contains('../') -or
            $name.Contains('/..') -or $name.Contains(':')) {
            throw 'Attachment ZIP includes an unsafe entry name.'
        }
        if ($name.EndsWith('/')) { continue }
        $files++
        $stream = $entry.Open()
        try {
            $buffer = New-Object byte[] 65536
            while ($stream.Read($buffer,0,$buffer.Length) -gt 0) {}
        } finally { $stream.Dispose() }
    }
} finally { $zip.Dispose() }
if ($files -ne [int]$manifest.uploadFileCount) {
    throw 'Attachment ZIP file count differs from the backup manifest.'
}
Write-Host ('BACKUP_VERIFIED=' + $path)
Write-Host ('TABLES=' + $tables + ' UPLOAD_FILES=' + $files +
    ' SQL_CHARACTERS=' + $totalSqlChars)
exit 0
