param([ValidateSet('pause','resume','status')][string]$Action='status')
$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
$Marker = Join-Path $Root '.local\watchdog.paused'
if (-not (Test-Path (Split-Path $Marker -Parent))) { throw 'Local configuration is missing.' }
switch ($Action) {
    'pause' {
        Set-Content -LiteralPath $Marker -Value 'manual-maintenance' -Encoding ASCII
        Write-Host 'WATCHDOG_PAUSED: Services will not be started or restarted until resumed.'
    }
    'resume' {
        Remove-Item -LiteralPath $Marker -Force -ErrorAction SilentlyContinue
        Write-Host 'WATCHDOG_RESUMED: The next watchdog check may start missing services.'
    }
    'status' {
        if (Test-Path $Marker) { Write-Host 'WATCHDOG_PAUSED' }
        else { Write-Host 'WATCHDOG_ACTIVE_UNLESS_PER_SERVICE_PAUSED' }
        foreach ($name in @('application','http-runner','node-runner','browser-runner')) {
            $file = Join-Path $Root ('.local\watchdog-' + $name + '.paused')
            if (Test-Path $file) { Write-Host ('MANUALLY_STOPPED '+$name) }
        }
    }
}
