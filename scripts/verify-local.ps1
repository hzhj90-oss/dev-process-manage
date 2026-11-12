param([switch]$IncludeMySql, [switch]$AuditDependencies, [switch]$BrowserIntegration,
    [switch]$AiRecoveryRealDb, [switch]$IsolatedRestoreE2E, [switch]$BusinessFlowRealDb,
    [switch]$ReleaseSafety)
$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
$Node = (Get-Command node -ErrorAction Stop).Source
$MavenCmd = Get-Command mvn.cmd,mvn -ErrorAction SilentlyContinue | Select-Object -First 1
$Maven = if ($MavenCmd) { $MavenCmd.Source } else { 'D:\config\apache-maven-3.6.3\bin\mvn.cmd' }
if (-not (Test-Path $Maven)) { throw 'Maven is not installed or discoverable.' }

# Restore E2E requires an explicit opt-in: it starts a disposable MySQL instance.
# It does not connect to the application MySQL server, but is never part of CI defaults.
if ($IsolatedRestoreE2E -and $env:DPM_ISOLATED_RESTORE_ALLOW_WRITE -cne 'YES') {
    throw 'Isolated database restore requires DPM_ISOLATED_RESTORE_ALLOW_WRITE=YES.'
}

# The business-flow acceptance creates a tagged project/version/requirement/design/case/cycle/task.
# Never run during normal verification. Explicit local-only opt-in is required.
if ($BusinessFlowRealDb -and $env:DPM_FLOW_E2E_ALLOW_WRITE -cne 'YES') {
    throw 'Business flow real DB E2E requires DPM_FLOW_E2E_ALLOW_WRITE=YES.'
}

# Real database recovery E2E is deliberately excluded from default and CI verification.
if ($AiRecoveryRealDb) {
    if ($env:DPM_AI_RECOVERY_E2E_ALLOW_WRITE -cne 'YES' -or
        $env:DPM_AI_RECOVERY_E2E_VERSION_ID -notmatch '^[1-9][0-9]{0,14}$') {
        throw 'AI recovery real DB E2E requires explicit DPM_AI_RECOVERY_E2E_ALLOW_WRITE=YES and DPM_AI_RECOVERY_E2E_VERSION_ID.'
    }
    $health = Invoke-RestMethod 'http://127.0.0.1:18090/api/health' -TimeoutSec 5
    if ($health.status -ne 'UP') { throw 'AI recovery E2E requires a healthy local manager.' }
    $running = Invoke-RestMethod 'http://127.0.0.1:18090/api/execution-tasks?status=RUNNING&pageNum=1&pageSize=1' -TimeoutSec 5
    if ([long]$running.total -gt 0) { throw 'Refusing real-DB recovery E2E while any task is RUNNING.' }
}

function Assert-Exit([string]$Name) {
    if ($LASTEXITCODE -ne 0) { throw "$Name failed (exit $LASTEXITCODE)." }
}
Write-Host '[1/5] Validate Vue component imports'
& $Node (Join-Path $Root 'frontend\scripts\verify-element-imports.mjs')
Assert-Exit 'Frontend import check'

Write-Host '[extra] ChatGPT task handoff prompt tests'
& $Node --test (Join-Path $Root 'frontend\src\utils\aiHandoff.test.mjs')
if ($LASTEXITCODE -ne 0) { throw 'ChatGPT handoff unit tests failed' }
& $Node --test (Join-Path $Root 'frontend\src\utils\aiResume.test.mjs') (Join-Path $Root 'frontend\src\utils\aiAttention.test.mjs') (Join-Path $Root 'frontend\src\utils\aiAudit.test.mjs') (Join-Path $Root 'frontend\src\utils\aiAuditExport.test.mjs')
Assert-Exit 'ChatGPT handoff and attention tests'

Write-Host '[extra] Complete paginated select-option loading and fail-closed validation'
& $Node --test (Join-Path $Root 'frontend\src\utils\pagedOptions.test.mjs')
Assert-Exit 'Paged select options tests'

Write-Host '[extra] Latest-response-wins and out-of-order request safety tests'
& $Node --test (Join-Path $Root 'frontend\src\utils\latestRequest.test.mjs')
Assert-Exit 'Latest response request tests'

Write-Host '[extra] Cross-module contextual navigation and strict route ID tests'
& $Node --test (Join-Path $Root 'frontend\src\utils\contextNavigation.test.mjs')
Assert-Exit 'Context navigation tests'

Write-Host '[extra] Report triage deep-link and result filters unit tests'
& $Node --test (Join-Path $Root 'frontend\src\utils\reportReview.test.mjs')
Assert-Exit 'Report triage unit tests'

Write-Host '[extra] Frozen cycle requirements and design snapshot coverage aggregation'
& $Node --test (Join-Path $Root 'frontend\src\utils\cycleCoverage.test.mjs')
Assert-Exit 'Frozen test round requirement coverage unit tests'

Write-Host '[extra] Case to planned cycle eligibility, version and snapshot consistency guards'
& $Node --test (Join-Path $Root 'frontend\src\utils\caseCyclePlacement.test.mjs')
Assert-Exit 'Case to cycle placement unit tests'

Write-Host '[extra] Requirement-to-case authoring source and immutable coverage guards'
& $Node --test (Join-Path $Root 'frontend\src\utils\caseCreationContext.test.mjs')
Assert-Exit 'Source requirement case creation unit tests'

Write-Host '[extra] Same-version test round regression/retest comparison guards'
& $Node --test (Join-Path $Root 'frontend\src\utils\roundComparison.test.mjs')
Assert-Exit 'Test round comparison unit tests'

Write-Host '[extra] Evidence upload metadata, size, digest and attempt-ownership guards'
& $Node --test (Join-Path $Root 'frontend\src\utils\attachmentSafety.test.mjs')
Assert-Exit 'Evidence attachment UI safety tests'

Write-Host '[extra] ChatGPT task protocol client tests (mock only)'
& $Node --test (Join-Path $Root 'scripts\chatgpt-task-client.test.mjs')
Assert-Exit 'ChatGPT task protocol client tests'

Write-Host '[extra] Read-only Git release worktree inventory and sensitive-file guards'
& $Node --test (Join-Path $PSScriptRoot 'release-worktree-audit.test.mjs')
Assert-Exit 'Release worktree parser and risk classification unit tests'

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
if ($AiRecoveryRealDb) {
    Write-Host '[explicit opt-in] Real database ChatGPT timeout/recovery E2E'
    & $Node (Join-Path $PSScriptRoot 'test-ai-recovery-real-db.mjs')
    Assert-Exit 'Real database ChatGPT recovery E2E'
}
if ($IsolatedRestoreE2E) {
    Write-Host '[explicit opt-in] Restore backup into disposable, loopback-only MySQL instance'
    & powershell.exe -NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'test-database-isolated-restore.ps1') -Apply
    Assert-Exit 'Isolated MySQL restore E2E'
}
if ($BusinessFlowRealDb) {
    Write-Host '[explicit opt-in] Complete project-to-report workflow E2E with isolated verification records'
    & $Node (Join-Path $PSScriptRoot 'test-business-flow-real-db.mjs')
    Assert-Exit 'Business workflow real database E2E'
}
if ($ReleaseSafety) {
    Write-Host '[explicit opt-in] Verify local binary release snapshot, rollback guards and backup readiness'
    $ps = Join-Path $env:WINDIR 'System32\WindowsPowerShell\v1.0\powershell.exe'
    & $ps -NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'check-release-readiness.ps1')
    Assert-Exit 'Release readiness audit'
    & $ps -NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'test-release-safety.ps1')
    Assert-Exit 'Release rollback isolation safety tests'
}
Write-Host 'Local regression verification completed.'
