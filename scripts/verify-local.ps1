param([switch]$IncludeMySql, [switch]$AuditDependencies, [switch]$BrowserIntegration)
$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
$Node = (Get-Command node -ErrorAction Stop).Source
$MavenCmd = Get-Command mvn.cmd,mvn -ErrorAction SilentlyContinue | Select-Object -First 1
$Maven = if ($MavenCmd) { $MavenCmd.Source } else { 'D:\config\apache-maven-3.6.3\bin\mvn.cmd' }
if (-not (Test-Path $Maven)) { throw 'Maven is not installed or discoverable.' }

function Assert-Exit([string]$Name) {
    if ($LASTEXITCODE -ne 0) { throw "$Name failed (exit $LASTEXITCODE)." }
}
Write-Host '[1/5] Validate Vue component imports'
& $Node (Join-Path $Root 'frontend\scripts\verify-element-imports.mjs')
Assert-Exit 'Frontend import check'

Write-Host '[2/5] HTTP DSL runner unit tests'
& $Node --test (Join-Path $Root 'runner\http-runner\http-dsl.test.mjs')
Assert-Exit 'HTTP runner tests'

Write-Host '[3/5] QuickJS Node runner unit tests'
& $Node --test (Join-Path $Root 'runner\node-runner\sandbox.test.mjs')
Assert-Exit 'Node runner tests'

Write-Host '[4/5] Browser Runner DSL unit tests'
& $Node --test (Join-Path $Root 'runner\browser-runner\browser-dsl.test.mjs') (Join-Path $Root 'runner\browser-runner\browser-engine.test.mjs')
Assert-Exit 'Browser Runner DSL tests'

Write-Host '[5/5] Java unit tests (does not restart application)'
& $Maven -f (Join-Path $Root 'backend\pom.xml') test
Assert-Exit 'Maven unit tests'

if ($AuditDependencies) {
    Write-Host '[extra] npm dependency security audit'
    & (Join-Path $PSScriptRoot 'audit-dependencies.ps1')
    Assert-Exit 'Dependency security audit'
}

if ($IncludeMySql) {
    Write-Host '[extra] MySQL database-clock and InnoDB integration tests'
    & (Join-Path $PSScriptRoot 'test-mysql-integration.ps1')
    Assert-Exit 'MySQL integration tests'
}
if ($BrowserIntegration) {
    Write-Host '[extra] Chrome Browser Runner local integration tests'
    & (Join-Path $PSScriptRoot 'test-browser-integration.ps1')
    Assert-Exit 'Browser Runner integration tests'
}
Write-Host 'Local regression verification completed.'
