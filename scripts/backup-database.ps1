param(
    [ValidateRange(1,365)][int]$RetentionDays = 30,
    [ValidateRange(1,100)][int]$MinimumBackups = 7,
    [ValidateRange(0,168)][int]$SkipIfRecentHours = 0
)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'database-backup-common.ps1')
Add-Type -AssemblyName System.IO.Compression.FileSystem
$root = Get-BackupDataRoot
$config = $null
$staging = $null
$mutex = New-Object System.Threading.Mutex($false,'Local\DPM-DatabaseBackup')
$lockHeld = $false
$timestamp = (Get-Date).ToUniversalTime().ToString('yyyyMMdd_HHmmss_fff')
$folderName = 'backup-' + $timestamp

try {
    try { $lockHeld = $mutex.WaitOne(0) }
    catch [Threading.AbandonedMutexException] { $lockHeld = $true }
    if (-not $lockHeld) { throw 'Another database backup is already running.' }
    if (-not (Test-Path -LiteralPath $root)) {
        New-Item -ItemType Directory -Path $root -Force | Out-Null
    }
    Protect-BackupDirectory $root
    if ($SkipIfRecentHours -gt 0) {
        $recent = @(Get-ChildItem -LiteralPath $root -Directory |
            Where-Object { $_.Name -match '^backup-\d{8}_\d{6}_\d{3}$' -and
                $_.CreationTimeUtc -ge [DateTime]::UtcNow.AddHours(-$SkipIfRecentHours) } |
            Sort-Object Name -Descending | Select-Object -First 1)
        if ($recent.Count) {
            $verifier = Join-Path $PSScriptRoot 'verify-database-backup.ps1'
            & powershell.exe -NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File $verifier -BackupPath $recent[0].FullName | Out-Null
            if ($LASTEXITCODE -eq 0) {
                Write-Host ('BACKUP_SKIPPED_RECENT=' + $recent[0].FullName)
                return
            }
        }
    }
    $staging = Join-Path $root ('.staging-' + [guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Path $staging | Out-Null
    Protect-BackupDirectory $staging

    $config = Get-LocalDatabaseConfig
    $dumpExecutable = Get-MySqlExecutable 'mysqldump.exe'
    $sqlFile = Join-Path $staging 'database.sql'
    $gzipFile = Join-Path $staging 'database.sql.gz'
    $zipFile = Join-Path $staging 'uploads.zip'
    $arguments = @(
        '--no-defaults', '--protocol=tcp', "--host=$($config.Host)",
        "--port=$($config.Port)", "--user=$($config.User)",
        '--default-character-set=utf8mb4', '--single-transaction',
        '--quick', '--routines', '--events', '--triggers',
        '--no-tablespaces', '--hex-blob', '--set-gtid-purged=OFF',
        "--result-file=$sqlFile", $config.Name
    )
    [void](Invoke-MySqlWithLocalCredentials $dumpExecutable $arguments $config)
    if (-not (Test-Path $sqlFile) -or (Get-Item $sqlFile).Length -lt 1024) {
        throw 'Database export is missing or unexpectedly small.'
    }
    $footer = @(Get-Content -LiteralPath $sqlFile -Tail 12 -Encoding UTF8)
    if (-not ($footer | Where-Object { $_ -match '^-- Dump completed on' })) {
        throw 'Database export is incomplete (completion marker missing).'
    }
    $tableCount = @(Select-String -LiteralPath $sqlFile -Pattern '^CREATE TABLE ' -Encoding UTF8).Count
    if ($tableCount -lt 1) { throw 'Database dump has no table definitions.' }

    $inputFile = [IO.File]::OpenRead($sqlFile)
    try {
        $outputFile = [IO.File]::Create($gzipFile)
        try {
            $gzip = [IO.Compression.GZipStream]::new($outputFile,[IO.Compression.CompressionLevel]::Optimal)
            try { $inputFile.CopyTo($gzip) }
            finally { $gzip.Dispose() }
        } finally { $outputFile.Dispose() }
    } finally { $inputFile.Dispose() }
    Remove-Item -LiteralPath $sqlFile -Force

    $uploads = Join-Path $script:BackupRoot 'data\uploads'
    if (-not (Test-Path $uploads -PathType Container)) {
        throw 'Attachment data directory is missing.'
    }
    $entries = @(Get-ChildItem -LiteralPath $uploads -Force -Recurse -ErrorAction Stop)
    if ($entries | Where-Object { ($_.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0 }) {
        throw 'Attachment directory contains a reparse point; refusing unsafe archive traversal.'
    }
    $uploadFileCount = @($entries | Where-Object { -not $_.PSIsContainer }).Count
    [IO.Compression.ZipFile]::CreateFromDirectory(
        $uploads,$zipFile,[IO.Compression.CompressionLevel]::Optimal,$false)

    $manifest = [ordered]@{
        formatVersion = 1
        createdAtUtc = (Get-Date).ToUniversalTime().ToString('o')
        database = $script:DatabaseName
        databaseTableCount = $tableCount
        uploadFileCount = $uploadFileCount
        files = [ordered]@{
            'database.sql.gz' = [ordered]@{
                sha256 = Get-Sha256 $gzipFile
                bytes = (Get-Item -LiteralPath $gzipFile).Length
            }
            'uploads.zip' = [ordered]@{
                sha256 = Get-Sha256 $zipFile
                bytes = (Get-Item -LiteralPath $zipFile).Length
            }
        }
    }
    $manifestPath = Join-Path $staging 'manifest.json'
    [IO.File]::WriteAllText($manifestPath,($manifest | ConvertTo-Json -Depth 7),
        [Text.UTF8Encoding]::new($false))
    $verifier = Join-Path $PSScriptRoot 'verify-database-backup.ps1'
    & powershell.exe -NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File $verifier -BackupPath $staging
    if ($LASTEXITCODE -ne 0) { throw 'Backup content verification failed; no backup was published.' }
    $final = Join-Path $root $folderName
    if (Test-Path -LiteralPath $final) { throw 'Backup destination already exists.' }
    Move-Item -LiteralPath $staging -Destination $final -ErrorAction Stop
    $staging = $null
    Write-Host ('BACKUP_CREATED=' + $final)
    Write-Host ('TABLES=' + $tableCount + ' UPLOAD_FILES=' + $uploadFileCount)

    # Retention applies only to successfully named automatic backups, never manual snapshots.
    $available = @(Get-ChildItem -LiteralPath $root -Directory -ErrorAction Stop |
        Where-Object { $_.Name -match '^backup-\d{8}_\d{6}_\d{3}$' } |
        Sort-Object Name -Descending)
    $cutoff = (Get-Date).ToUniversalTime().AddDays(-$RetentionDays)
    for ($i = $MinimumBackups; $i -lt $available.Count; $i++) {
        $entry = $available[$i]
        if ($entry.CreationTimeUtc -lt $cutoff -and
            (Test-Path -LiteralPath (Join-Path $entry.FullName 'manifest.json'))) {
            Remove-Item -LiteralPath $entry.FullName -Recurse -Force
            Write-Host ('EXPIRED_BACKUP_REMOVED=' + $entry.Name)
        }
    }
} finally {
    if ($staging -and (Test-Path -LiteralPath $staging)) {
        Remove-Item -LiteralPath $staging -Recurse -Force -ErrorAction SilentlyContinue
    }
    $config = $null
    if ($lockHeld) { $mutex.ReleaseMutex() }
    $mutex.Dispose()
}
