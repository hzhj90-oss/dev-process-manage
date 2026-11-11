$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
$NodeCommand = Get-Command node -ErrorAction Stop
$Node = $NodeCommand.Source
$NpmCli = Join-Path $Root '.local\tools\npm-12.2.2\package\bin\npm-cli.js'

if (-not (Test-Path $NpmCli)) {
    & (Join-Path $PSScriptRoot 'setup-portable-npm.ps1')
    if (-not (Test-Path $NpmCli)) { throw 'Portable npm bootstrap failed.' }
}

foreach ($RelativeDir in @('frontend', 'runner\node-runner', 'runner\browser-runner')) {
    $PackageDir = Join-Path $Root $RelativeDir
    if (-not (Test-Path (Join-Path $PackageDir 'package-lock.json'))) {
        throw "Missing lockfile: $RelativeDir"
    }
    Write-Host "Auditing $RelativeDir (moderate and above)..."
    & $Node $NpmCli audit --audit-level=moderate --package-lock-only --prefix $PackageDir
    if ($LASTEXITCODE -ne 0) { throw "Dependency audit failed: $RelativeDir" }
}
Write-Host 'All dependency audits passed.'
