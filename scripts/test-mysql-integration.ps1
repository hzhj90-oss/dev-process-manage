$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
$ConfigPath = Join-Path $Root '.local\application-local.yml'
$LocalMaven = 'D:\config\apache-maven-3.6.3\bin\mvn.cmd'
$MavenCommand = Get-Command mvn.cmd,mvn -ErrorAction SilentlyContinue | Select-Object -First 1
$Maven = if ($MavenCommand) { $MavenCommand.Source } else { $LocalMaven }
if (-not (Test-Path $Maven)) { throw "Maven not found: $Maven" }

# CI supplies all three DPM_IT_* settings; local use falls back to .local.
$HasAnyEnv = [bool]($env:DPM_IT_MYSQL_URL -or $env:DPM_IT_MYSQL_USERNAME -or $env:DPM_IT_MYSQL_PASSWORD)
$HasFullEnv = [bool]($env:DPM_IT_MYSQL_URL -and $env:DPM_IT_MYSQL_USERNAME -and
    ($null -ne $env:DPM_IT_MYSQL_PASSWORD))
if ($HasAnyEnv -and -not $HasFullEnv) {
    throw 'Partial DPM_IT_MYSQL_* settings: provide URL, USERNAME and PASSWORD together.'
}
$FromLocal = -not $HasFullEnv
if ($FromLocal -and -not (Test-Path $ConfigPath)) {
    throw "Local MySQL config not found: $ConfigPath"
}
$Config = if ($FromLocal) { Get-Content -LiteralPath $ConfigPath -Raw } else { '' }
function Get-ConfigValue([string]$Name) {
    $Match = [regex]::Match($Config, "(?m)^\s*${Name}:\s*(.*)$")
    if (-not $Match.Success) { throw "Missing datasource setting: $Name" }
    return $Match.Groups[1].Value.Trim().Trim('"', "'")
}

if ($FromLocal) {
    $env:DPM_IT_MYSQL_URL = Get-ConfigValue 'url'
    $env:DPM_IT_MYSQL_USERNAME = Get-ConfigValue 'username'
    $env:DPM_IT_MYSQL_PASSWORD = Get-ConfigValue 'password'
}
if (-not $env:DPM_IT_MYSQL_URL -or -not $env:DPM_IT_MYSQL_USERNAME) {
    throw 'MySQL integration-test datasource settings are incomplete.'
}

try {
    Write-Host 'Running RunnerLeaseMySqlIT against the local MySQL database.'
    & $Maven -f (Join-Path $Root 'backend\pom.xml') '-Dtest=RunnerLeaseMySqlIT' test
    if ($LASTEXITCODE -ne 0) { throw 'MySQL integration test failed.' }
    Write-Host 'RunnerLeaseMySqlIT passed.'
}
finally {
    # Only remove values that this script loaded; never erase caller-provided CI settings.
    if ($FromLocal) {
        Remove-Item Env:\DPM_IT_MYSQL_URL -ErrorAction SilentlyContinue
        Remove-Item Env:\DPM_IT_MYSQL_USERNAME -ErrorAction SilentlyContinue
        Remove-Item Env:\DPM_IT_MYSQL_PASSWORD -ErrorAction SilentlyContinue
    }
}
