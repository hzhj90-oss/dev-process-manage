$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
$LogPath = Join-Path $Root 'logs\database-backup-schedule.log'
try {
    & (Join-Path $PSScriptRoot 'backup-database.ps1') -SkipIfRecentHours 20 | Out-Null
    $message = (Get-Date).ToUniversalTime().ToString('o') + ' | BACKUP_CHECK_OK'
    Add-Content -LiteralPath $LogPath -Value $message -Encoding UTF8
    Write-Host $message
} catch {
    $message = (Get-Date).ToUniversalTime().ToString('o') + ' | BACKUP_CHECK_FAILED'
    Add-Content -LiteralPath $LogPath -Value $message -Encoding UTF8
    Write-Host $message
    exit 1
}
