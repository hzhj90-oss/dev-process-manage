$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
$Port = 18090
$LocalConfig = Join-Path $Root '.local\application-local.yml'
$Jar = Join-Path $Root 'backend\target\dev-process-manager.jar'

if (-not (Test-Path $LocalConfig)) { throw "Local database config not found: $LocalConfig" }

# Runner shared secret stays in the ignored .local directory and is inherited only by local processes.
$RunnerTokenFile = Join-Path $Root '.local\runner-token.txt'
if (-not (Test-Path $RunnerTokenFile)) {
    $bytes = New-Object byte[] 32
    $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    try { $rng.GetBytes($bytes) } finally { $rng.Dispose() }
    $token = [Convert]::ToBase64String($bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_')
    [System.IO.File]::WriteAllText($RunnerTokenFile, $token, ([System.Text.UTF8Encoding]::new($false)))
}
$env:DPM_RUNNER_TOKEN = (Get-Content -LiteralPath $RunnerTokenFile -Raw).Trim()
if ($env:DPM_RUNNER_TOKEN.Length -lt 32) { throw 'Local Runner token file is invalid; remove .local\runner-token.txt and restart.' }

$listener = Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue
if ($listener) { throw "Port $Port is already in use. Check the existing process before starting." }

& (Join-Path $PSScriptRoot 'build.ps1')
if (-not (Test-Path $Jar)) { throw "Application JAR not found: $Jar" }

$Java = (Get-Command java -ErrorAction Stop).Source
$Stdout = Join-Path $Root 'logs\application.stdout.log'
$Stderr = Join-Path $Root 'logs\application.stderr.log'
$PidFile = Join-Path $Root 'logs\application.pid'
$arguments = @('-jar', $Jar, '--spring.config.additional-location=file:./.local/application-local.yml')
$process = Start-Process -FilePath $Java -ArgumentList $arguments -WorkingDirectory $Root -WindowStyle Hidden -PassThru -RedirectStandardOutput $Stdout -RedirectStandardError $Stderr
Set-Content -LiteralPath $PidFile -Value $process.Id -Encoding ASCII

$healthy = $false
for ($i = 0; $i -lt 30; $i++) {
    Start-Sleep -Seconds 1
    try {
        $response = Invoke-RestMethod -Uri "http://127.0.0.1:$Port/api/health" -TimeoutSec 2
        if ($response.status -eq 'UP') { $healthy = $true; break }
    } catch {
        if ($process.HasExited) { break }
    }
}
if (-not $healthy) {
    if (-not $process.HasExited) { Stop-Process -Id $process.Id -Force }
    throw "Application did not become healthy. Check logs\application.stderr.log and logs\application.stdout.log."
}
Write-Host "Application started. PID=$($process.Id)"
Write-Host "Open: http://127.0.0.1:$Port"
Write-Host 'Only the Spring Boot port is exposed.'
