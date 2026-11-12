# Read-only local restore readiness: does not create databases or expose credentials.
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'database-backup-common.ps1')
$config = Get-LocalDatabaseConfig
$mysql = Get-MySqlExecutable 'mysql.exe'
$args = @('--no-defaults','--protocol=TCP','--host=127.0.0.1','--port=3306',
  "--user=$($config.User)","--database=$($config.Name)",'--batch','--skip-column-names',
  '--execute=SHOW GRANTS')
$grants = @(Invoke-MySqlWithLocalCredentials $mysql $args $config)
$globalWrite = @($grants | Where-Object { $_ -match '(?i)GRANT (?!USAGE)(.*?) ON \*\.\*' })
Write-Host ('APP_GRANTS=' + $grants.Count)
Write-Host ('APP_GLOBAL_WRITE_GRANTS=' + $globalWrite.Count)
Write-Host ('APP_HAS_RESTORE_SCHEMA_GRANT=' + [bool](@($grants | Where-Object { $_ -match '(?i)ON `?dpm_restore_verify_' }).Count))
$root = Get-BackupDataRoot
$recent = @(Get-ChildItem -LiteralPath $root -Directory |
  Where-Object { $_.Name -match '^backup-\d{8}_\d{6}_\d{3}$' } |
  Sort-Object Name -Descending | Select-Object -First 1)
if ($recent.Count -ne 1) { throw 'No official completed backup.' }
$archive = Join-Path $recent[0].FullName 'database.sql.gz'
$inputStream = [IO.File]::OpenRead($archive)
$flags = @{}
$tables = 0
$bytes = 0L
try {
  $gzip = New-Object IO.Compression.GZipStream($inputStream,[IO.Compression.CompressionMode]::Decompress)
  try {
    $reader = New-Object IO.StreamReader($gzip,[Text.Encoding]::UTF8)
    try {
      while ($null -ne ($line = $reader.ReadLine())) {
        $bytes += $line.Length
        if ($line.StartsWith('CREATE TABLE ')) { $tables++ }
        foreach ($pattern in @('(?i)^\s*(USE|CREATE DATABASE|DROP DATABASE|ALTER DATABASE|GRANT|REVOKE|CREATE USER|DROP USER|SET GLOBAL)\b',
          '(?i)^\s*(source|system|\\!|\\.)\b','(?i)^\s*DELIMITER\b',
          '(?i)\bDEFINER\s*=','(?i)^\s*DROP TABLE IF EXISTS')) {
          if ($line -match $pattern) { $flags[$pattern] = 1 + [int]$flags[$pattern] }
        }
      }
    } finally { $reader.Dispose() }
  } finally { $gzip.Dispose() }
} finally { $inputStream.Dispose() }
Write-Host ('BACKUP_TABLES=' + $tables)
Write-Host ('BACKUP_TEXT_CHARS=' + $bytes)
foreach($k in $flags.Keys) { Write-Host ('SQL_PATTERN=' + $k + ' COUNT=' + $flags[$k]) }
