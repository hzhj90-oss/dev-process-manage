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
& $Node --test (Join-Path $BrowserRoot 'browser-protocol.test.mjs')
if ($LASTEXITCODE -ne 0) { throw 'Browser Runner protocol test failed.' }
Write-Host '[3/3] Verify Browser language in the actual script editor'
& $Node (Join-Path $BrowserRoot 'browser-ui-smoke.mjs')
if ($LASTEXITCODE -ne 0) { throw 'Browser script editor UI test failed.' }
Write-Host 'Browser local integration passed without test database mutation.'
