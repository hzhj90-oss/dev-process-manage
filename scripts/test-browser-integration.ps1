$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
$Node = (Get-Command node -ErrorAction Stop).Source
$Chrome = 'C:\Program Files\Google\Chrome\Application\chrome.exe'
$BrowserRoot = Join-Path $Root 'runner\browser-runner'
if (-not (Test-Path $Chrome)) { throw 'Google Chrome is missing.' }
if (-not (Test-Path (Join-Path $BrowserRoot 'node_modules\playwright-core'))) {
    throw 'Browser dependencies are missing. Run npm ci --ignore-scripts for browser-runner.'
}
$health = Invoke-RestMethod 'http://127.0.0.1:18090/api/health' -TimeoutSec 10
if ($health.status -ne 'UP') { throw 'Manager is not healthy.' }
$env:DPM_CHROME_PATH = $Chrome
$env:DPM_MANAGER_URL = 'http://127.0.0.1:18090'
Write-Host '[1/3] Run non-destructive Chrome browser smoke'
& $Node (Join-Path $BrowserRoot 'browser-smoke.mjs')
if ($LASTEXITCODE -ne 0) { throw 'Browser smoke failed.' }
Write-Host '[2/3] Verify worker claim/events/PNG upload/completion against mock manager'
# One Chrome worker at a time: a parallel full browser smoke can exhaust the
# T14s paging file while the user's own Chrome windows are open.
& $Node --test --test-concurrency=1 (Join-Path $BrowserRoot 'browser-protocol.test.mjs') (Join-Path $BrowserRoot 'browser-protocol-failure.test.mjs')
if ($LASTEXITCODE -ne 0) { throw 'Browser Runner protocol test failed.' }
Write-Host '[3/3] Verify Browser language in the actual script editor'
& $Node (Join-Path $BrowserRoot 'browser-ui-smoke.mjs')
if ($LASTEXITCODE -ne 0) { throw 'Browser script editor UI test failed.' }
Write-Host '[extra] Verify assertion failure classification and automatic screenshots'
& $Node (Join-Path $BrowserRoot 'browser-failure-smoke.mjs')
if ($LASTEXITCODE -ne 0) { throw 'Browser failure-evidence regression failed.' }
Write-Host '[extra] Verify dashboard displays live totals and navigable modules'
& $Node (Join-Path $BrowserRoot 'browser-dashboard-smoke.mjs')
if ($LASTEXITCODE -ne 0) { throw 'Dashboard live stats smoke failed.' }
Write-Host '[extra] Verify immediate Chrome cancellation on lease loss'
& $Node (Join-Path $BrowserRoot 'browser-abort-smoke.mjs')
if ($LASTEXITCODE -ne 0) { throw 'Browser cancellation regression failed.' }
Write-Host '[extra] Verify Runner online/offline monitor and UI states'
& $Node (Join-Path $BrowserRoot 'browser-runner-monitor-smoke.mjs')
if ($LASTEXITCODE -ne 0) { throw 'Runner presence monitor regression failed.' }
Write-Host '[extra] Verify task attention alerts and typed recovery safety'
& $Node (Join-Path $BrowserRoot 'browser-attention-smoke.mjs')
if ($LASTEXITCODE -ne 0) { throw 'Execution attention/recovery UI smoke failed.' }
Write-Host '[extra] Verify ChatGPT handoff queue and clipboard without executing tasks'
& $Node (Join-Path $BrowserRoot 'browser-ai-handoff-smoke.mjs')
if ($LASTEXITCODE -ne 0) { throw 'ChatGPT handoff browser smoke failed.' }
Write-Host '[extra] Verify real CSV report download in Chrome, no database writes'
& $Node (Join-Path $BrowserRoot 'browser-report-csv-smoke.mjs')
if ($LASTEXITCODE -ne 0) { throw 'Report CSV Chrome download smoke failed.' }
Write-Host '[extra] Verify failure triage and safe report-to-task navigation'
& $Node (Join-Path $BrowserRoot 'browser-report-review-smoke.mjs')
if ($LASTEXITCODE -ne 0) { throw 'Report failure triage Chrome smoke failed.' }
Write-Host '[extra] Audit test cycle, case, report and execution metadata consistency (GET only)'
& $Node (Join-Path $Root 'scripts\audit-cycle-results.mjs')
if ($LASTEXITCODE -ne 0) { throw 'Test cycle result consistency audit failed.' }
Write-Host '[extra] Diagnose inconsistent historical cycle states in real Chrome (GET-only)'
& $Node (Join-Path $BrowserRoot 'browser-cycle-diagnostics-smoke.mjs')
if ($LASTEXITCODE -ne 0) { throw 'Cycle status diagnostics Chrome smoke failed.' }
Write-Host '[extra] Audit root/child task aggregation and latest attempt states (GET-only)'
& $Node (Join-Path $Root 'scripts\audit-task-hierarchy.mjs')
if ($LASTEXITCODE -ne 0) { throw 'Task hierarchy and latest attempt consistency audit failed.' }
Write-Host '[extra] Verify project-to-version-to-requirement/test-cycle contextual navigation in Chrome'
& $Node (Join-Path $BrowserRoot 'browser-context-navigation-smoke.mjs')
if ($LASTEXITCODE -ne 0) { throw 'Cross-module context navigation Chrome smoke failed.' }
Write-Host '[extra] Verify stale-response rejection, persistent list error/retry and original edit ID in Chrome'
& $Node (Join-Path $BrowserRoot 'browser-list-stale-response-smoke.mjs')
if ($LASTEXITCODE -ne 0) { throw 'List stale response and project edit Chrome smoke failed.' }
Write-Host '[extra] Verify report/task list and detail retry UX in real Chrome (GET-only)'
& $Node (Join-Path $BrowserRoot 'browser-report-task-retry-smoke.mjs')
if ($LASTEXITCODE -ne 0) { throw 'Report/task retry and stale-response Chrome smoke failed.' }
Write-Host '[extra] Verify cycle detail retry and ChatGPT tracking/queue ABA safety (GET-only Chrome)'
& $Node (Join-Path $BrowserRoot 'browser-cycle-ai-async-smoke.mjs')
if ($LASTEXITCODE -ne 0) { throw 'Cycle/AI async response integrity Chrome smoke failed.' }
Write-Host '[extra] Verify >100 project/version/case select options and retry on missing pages (GET-only Chrome)'
& $Node (Join-Path $BrowserRoot 'browser-paged-options-smoke.mjs')
if ($LASTEXITCODE -ne 0) { throw 'Paged option Chrome smoke failed.' }
Write-Host '[extra] Verify 101st requirement/script links and retry after missing pages (GET-only Chrome)'
& $Node (Join-Path $BrowserRoot 'browser-case-link-options-smoke.mjs')
if ($LASTEXITCODE -ne 0) { throw 'Test-case link-option pagination Chrome smoke failed.' }
Write-Host '[extra] Verify test case editor close/reopen and revision history stale-response safety (GET-only Chrome)'
& $Node (Join-Path $BrowserRoot 'browser-case-editor-race-smoke.mjs')
if ($LASTEXITCODE -ne 0) { throw 'Case editor/history stale-response Chrome smoke failed.' }
Write-Host '[extra] Verify script revision and test-cycle editor close/reopen async isolation in Chrome'
& $Node (Join-Path $BrowserRoot 'browser-script-cycle-editor-race-smoke.mjs')
if ($LASTEXITCODE -ne 0) { throw 'Script/cycle editor race Chrome regression failed.' }
Write-Host '[extra] Verify requirement design modal ownership and script list stale-response retry in Chrome'
& $Node (Join-Path $BrowserRoot 'browser-design-script-list-race-smoke.mjs')
if ($LASTEXITCODE -ne 0) { throw 'Requirement design/script list async safety Chrome smoke failed.' }
Write-Host '[extra] Project/version/environment double-submit and list race safe flows (intercepted writes only)'
& $Node (Join-Path $BrowserRoot 'browser-core-settings-safety-smoke.mjs')
if ($LASTEXITCODE -ne 0) { throw 'Project/version/environment safety Chrome regression failed.' }
Write-Host '[extra] Full create flows: project save failure retry, version and environment validation (all intercepted)'
& $Node (Join-Path $BrowserRoot 'browser-core-settings-create-flow-smoke.mjs')
if ($LASTEXITCODE -ne 0) { throw 'Core config create-flow Chrome regression failed.' }
Write-Host '[extra] Requirement/design/script/case/cycle save lock and validation in Chrome (mock writes only)'
& $Node (Join-Path $BrowserRoot 'browser-save-critical-section-smoke.mjs')
if ($LASTEXITCODE -ne 0) { throw 'Business editor critical-section Chrome regression failed.' }
Write-Host '[extra] Cycle-case, script enable and task cancellation slow-response safety (mock writes only)'
& $Node (Join-Path $BrowserRoot 'browser-mutation-safety-smoke.mjs')
if ($LASTEXITCODE -ne 0) { throw 'Cycle/script/task mutation safety Chrome regression failed.' }
Write-Host '[extra] Cycle start/abort and whole-cycle/case task creation duplicate-click, replay and lost-response safety'
& $Node (Join-Path $BrowserRoot 'browser-cycle-action-safety-smoke.mjs')
if ($LASTEXITCODE -ne 0) { throw 'Cycle lifecycle and task creation Chrome regression failed.' }
Write-Host '[extra] Human task start/complete/human intervention/recovery async and critical-section safety'
& $Node (Join-Path $BrowserRoot 'browser-task-action-safety-smoke.mjs')
if ($LASTEXITCODE -ne 0) { throw 'Manual task action critical-section Chrome regression failed.' }
Write-Host '[extra] Evidence attachment upload/download, SHA-256, lost-response recovery and child task ownership (mock only)'
& $Node (Join-Path $BrowserRoot 'browser-attachment-safety-smoke.mjs')
if ($LASTEXITCODE -ne 0) { throw 'Evidence attachment Chrome regression failed.' }
Write-Host '[extra] Read-only real-fixture end-to-end user flow across project/version/requirement/design/case/cycle/report/task'
& $Node (Join-Path $BrowserRoot 'browser-real-workflow-acceptance.mjs')
if ($LASTEXITCODE -ne 0) { throw 'Real-fixture end-user journey Chrome acceptance failed.' }
Write-Host '[extra] Multi-round retest/regression comparison, no previous round, HTTP retry and stale-response isolation (mock only)'
& $Node (Join-Path $BrowserRoot 'browser-multi-round-comparison-smoke.mjs')
if ($LASTEXITCODE -ne 0) { throw 'Multi-round comparison Chrome regression failed.' }
Write-Host '[extra] Requirement-to-case one-click authoring, source prefill, retry, stale response and no backend writes'
& $Node (Join-Path $BrowserRoot 'browser-requirement-case-create-smoke.mjs')
if ($LASTEXITCODE -ne 0) { throw 'Requirement-to-case authoring Chrome acceptance failed.' }
Write-Host '[extra] Case to planned cycle placement, version scope, generic coverage warning, create-prefill and stale guards (mock only)'
& $Node (Join-Path $BrowserRoot 'browser-case-cycle-placement-smoke.mjs')
if ($LASTEXITCODE -ne 0) { throw 'Case cycle placement Chrome regression failed.' }
Write-Host '[extra] Frozen cycle requirement coverage dashboard: distinct requirements, generic cases, design gaps, corrupt snapshot rejection'
& $Node (Join-Path $BrowserRoot 'browser-cycle-coverage-smoke.mjs')
if ($LASTEXITCODE -ne 0) { throw 'Frozen cycle coverage Chrome regression failed.' }
Write-Host 'Browser local integration passed without test database mutation.'
