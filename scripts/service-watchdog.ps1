param(
    [ValidateSet('application','http-runner','node-runner','browser-runner')]
    [string[]]$Services = @('application','http-runner','node-runner','browser-runner'),
    [switch]$Repair,
    [switch]$DryRun
)
$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
$Logs = Join-Path $Root 'logs'
$Local = Join-Path $Root '.local'
$PauseFile = Join-Path $Local 'watchdog.paused'
$Names = @('application','http-runner','node-runner','browser-runner')
$Scripts = @{
    'application' = 'backend\target\dev-process-manager.jar'
    'http-runner' = 'runner\http-runner\runner.mjs'
    'node-runner' = 'runner\node-runner\runner.mjs'
    'browser-runner' = 'runner\browser-runner\runner.mjs'
}
$Starters = @{
    'application' = 'start.ps1'
    'http-runner' = 'start-http-runner.ps1'
    'node-runner' = 'start-node-runner.ps1'
    'browser-runner' = 'start-browser-runner.ps1'
}

function Write-WatchdogEvent([string]$Service,[string]$Status,[string]$Message) {
    $safe = ($Message -replace '[\r\n]+',' ').Substring(0,[Math]::Min($Message.Length,240))
    $line = (Get-Date).ToUniversalTime().ToString('o') + ' | ' + $Service + ' | ' + $Status + ' | ' + $safe
    Write-Host $line
    if (-not $DryRun) {
        Add-Content -LiteralPath (Join-Path $Logs 'service-watchdog.log') -Value $line -Encoding UTF8
    }
}
function Get-IdentifiedProcesses([string]$Service) {
    $expected = Join-Path $Root $Scripts[$Service]
    $isJava = $Service -eq 'application'
    $processName = if ($isJava) {'^(java|javaw)\.exe$'} else {'^node\.exe$'}
    # Must match the full expected script/JAR path as an argument, not just "runner.mjs".
    $escaped = [Regex]::Escape($expected)
    $argumentPattern = '(?i)(^|[\s"' + "'" + '])' + $escaped + '($|[\s"' + "'" + '])'
    return @(Get-CimInstance Win32_Process -ErrorAction Stop | Where-Object {
        $_.Name -match $processName -and $_.CommandLine -match $argumentPattern
    })
}
function Test-BackendHealth {
    try {
        $result = Invoke-RestMethod -Uri 'http://127.0.0.1:18090/api/health' -TimeoutSec 3
        return $result.status -eq 'UP'
    } catch { return $false }
}
function Test-RestartBudget([string]$Service) {
    $file = Join-Path $Logs ('watchdog-' + $Service + '-attempts.txt')
    $since = [DateTime]::UtcNow.AddHours(-1)
    $kept = @()
    if (Test-Path -LiteralPath $file) {
        foreach ($line in @(Get-Content -LiteralPath $file -ErrorAction SilentlyContinue)) {
            $value = [DateTime]::MinValue
            if ([DateTime]::TryParse($line,[ref]$value) -and $value.ToUniversalTime() -gt $since) {
                $kept += $value.ToUniversalTime().ToString('o')
            }
        }
    }
    if ($kept.Count -ge 3) { return $false }
    if (-not $DryRun) {
        $kept += [DateTime]::UtcNow.ToString('o')
        Set-Content -LiteralPath $file -Value $kept -Encoding ASCII
    }
    return $true
}
function Read-PidFile([string]$Service) {
    $file = Join-Path $Logs ($Service + '.pid')
    if (-not (Test-Path -LiteralPath $file)) { return 0 }
    $value = 0
    [void][int]::TryParse((Get-Content -LiteralPath $file -Raw).Trim(),[ref]$value)
    return $value
}
function Invoke-Check([string]$Service) {
    if (Test-Path -LiteralPath (Join-Path $Local ('watchdog-' + $Service + '.paused'))) {
        Write-WatchdogEvent $Service 'MANUALLY_STOPPED' 'Service was explicitly stopped; automatic restart is disabled until an explicit start.'
        return
    }
    $matching = @(Get-IdentifiedProcesses $Service)
    if ($matching.Count -gt 1) {
        Write-WatchdogEvent $Service 'DUPLICATE' 'Multiple exact matching processes; not stopping any of them.'
        return
    }
    if ($matching.Count -eq 1) {
        $processId = [int]$matching[0].ProcessId
        $savedPid = Read-PidFile $Service
        if ($savedPid -ne $processId) {
            if (-not $DryRun -and $Repair) {
                Set-Content -LiteralPath (Join-Path $Logs ($Service + '.pid')) -Value $processId -Encoding ASCII
            }
            Write-WatchdogEvent $Service 'PID_MISMATCH' "Actual PID $processId; recorded PID $savedPid. Repair=$Repair"
        }
        if ($Service -eq 'application' -and -not (Test-BackendHealth)) {
            Write-WatchdogEvent $Service 'UNHEALTHY' 'Java process exists but health is down; do NOT terminate or restart automatically.'
        } else {
            Write-Host "$Service RUNNING PID=$processId"
        }
        return
    }
    if ($Service -eq 'application') {
        if (Get-NetTCPConnection -LocalPort 18090 -State Listen -ErrorAction SilentlyContinue) {
            Write-WatchdogEvent $Service 'PORT_OCCUPIED' 'Unknown process owns port 18090; refusing a second backend.'
            return
        }
    } elseif (-not (Test-BackendHealth)) {
        Write-WatchdogEvent $Service 'BACKEND_UNAVAILABLE' 'Cannot start Runner while manager health is down.'
        return
    }
    if (-not $Repair -or $DryRun) {
        Write-WatchdogEvent $Service 'MISSING' 'Restart required but not attempted (read-only or dry-run mode).'
        return
    }
    if (-not (Test-RestartBudget $Service)) {
        Write-WatchdogEvent $Service 'RATE_LIMITED' 'Three restart attempts within one hour; manual inspection required.'
        return
    }
    Write-WatchdogEvent $Service 'STARTING' 'Starting an absent owned process; never replaying application tasks.'
    try {
        $starter = Join-Path $PSScriptRoot $Starters[$Service]
        if ($Service -eq 'application') { & $starter -SkipBuild }
        else { & $starter }
        $after = @(Get-IdentifiedProcesses $Service)
        if ($after.Count -ne 1) { throw 'Startup did not produce exactly one identifiable process.' }
        if ($Service -eq 'application' -and -not (Test-BackendHealth)) {
            throw 'Backend process started but health check did not return UP.'
        }
        Write-WatchdogEvent $Service 'RESTARTED' ('PID=' + $after[0].ProcessId)
    } catch {
        Write-WatchdogEvent $Service 'START_FAILED' 'Startup script failed; inspect application/runner stderr logs.'
    }
}

if (-not (Test-Path $Logs)) { New-Item -ItemType Directory -Path $Logs -Force | Out-Null }
if (-not (Test-Path $Local)) { throw 'Local configuration directory missing.' }
$mutex = New-Object System.Threading.Mutex($false,'Local\DPM-DevProcessManager-ServiceWatchdog')
$locked = $false
try {
    try { $locked = $mutex.WaitOne(0) }
    catch [System.Threading.AbandonedMutexException] { $locked = $true }
    if (-not $locked) {
        Write-Host 'WATCHDOG_ALREADY_RUNNING; skip overlapping check.'
        return
    }
    if (Test-Path $PauseFile) {
        Write-WatchdogEvent 'all' 'PAUSED' 'Autorestart is paused for maintenance.'
        return
    }
    foreach ($name in $Names) {
        if ($Services -contains $name) {
            Invoke-Check $name
        }
    }
} finally {
    if ($locked) { $mutex.ReleaseMutex() }
    $mutex.Dispose()
}
