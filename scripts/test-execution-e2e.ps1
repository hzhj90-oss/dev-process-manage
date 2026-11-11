[CmdletBinding()]
param(
    [string]$BaseUrl = 'http://127.0.0.1:18090',
    [long]$VersionId = 4,
    [long]$EnvironmentId = 5,
    [int]$WaitSeconds = 120
)
$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
$Api = $BaseUrl.TrimEnd('/') + '/api'
$Stamp = Get-Date -Format 'yyyyMMdd-HHmmss'

function Post-Json([string]$Uri, [object]$Body) {
    $json = ConvertTo-Json -InputObject $Body -Depth 15 -Compress
    Invoke-RestMethod -Uri $Uri -Method Post -ContentType 'application/json; charset=utf-8' -Body ([System.Text.Encoding]::UTF8.GetBytes($json)) -TimeoutSec 20
}
function Invoke-ConcurrentPost([string]$Uri, [object]$Body, [int]$Count = 2) {
    $json = ConvertTo-Json -InputObject $Body -Depth 15 -Compress
    $jobs = @()
    for ($i = 0; $i -lt $Count; $i++) {
        $jobs += Start-Job -ArgumentList $Uri, $json -ScriptBlock {
            param($RequestUri, $RequestBody)
            try {
                $response = Invoke-WebRequest -Uri $RequestUri -Method Post -ContentType 'application/json; charset=utf-8' -Body ([System.Text.Encoding]::UTF8.GetBytes($RequestBody)) -UseBasicParsing -TimeoutSec 30
                [pscustomobject]@{ statusCode = [int]$response.StatusCode; error = $null }
            } catch {
                $statusCode = $null
                if ($_.Exception.Response) {
                    try { $statusCode = [int]$_.Exception.Response.StatusCode } catch {}
                }
                [pscustomobject]@{ statusCode = $statusCode; error = $_.Exception.Message }
            }
        }
    }
    $completed = Wait-Job -Job $jobs -Timeout 40
    if (@($completed).Count -ne $jobs.Count) {
        $jobs | Where-Object { $_.State -eq 'Running' } | Stop-Job
        $jobs | Remove-Job -Force
        throw "Concurrent POST requests timed out: $Uri"
    }
    $results = @($jobs | Receive-Job)
    $jobs | Remove-Job -Force
    return $results
}
function Invoke-ConcurrentPostPair([string]$FirstUri, [object]$FirstBody, [string]$SecondUri, [object]$SecondBody) {
    $requests = @(
        @{ uri = $FirstUri; body = (ConvertTo-Json -InputObject $FirstBody -Depth 15 -Compress) },
        @{ uri = $SecondUri; body = (ConvertTo-Json -InputObject $SecondBody -Depth 15 -Compress) }
    )
    $jobs = @()
    foreach ($request in $requests) {
        $jobs += Start-Job -ArgumentList $request.uri, $request.body -ScriptBlock {
            param($RequestUri, $RequestBody)
            try {
                $response = Invoke-WebRequest -Uri $RequestUri -Method Post -ContentType 'application/json; charset=utf-8' -Body ([System.Text.Encoding]::UTF8.GetBytes($RequestBody)) -UseBasicParsing -TimeoutSec 30
                [pscustomobject]@{ requestUri = $RequestUri; statusCode = [int]$response.StatusCode; error = $null }
            } catch {
                $statusCode = $null
                if ($_.Exception.Response) {
                    try { $statusCode = [int]$_.Exception.Response.StatusCode } catch {}
                }
                [pscustomobject]@{ requestUri = $RequestUri; statusCode = $statusCode; error = $_.Exception.Message }
            }
        }
    }
    $completed = Wait-Job -Job $jobs -Timeout 40
    if (@($completed).Count -ne $jobs.Count) {
        $jobs | Where-Object { $_.State -eq 'Running' } | Stop-Job
        $jobs | Remove-Job -Force
        throw 'Concurrent completion/abort requests timed out.'
    }
    $results = @($jobs | Receive-Job)
    $jobs | Remove-Job -Force
    return $results
}
function Add-Event([long]$TaskId, [long]$ExecutionId, [string]$Type, [string]$Key, [string]$Content, [object]$Data) {
    $eventJson = if ($null -eq $Data) { $null } else { ConvertTo-Json -InputObject $Data -Depth 12 -Compress }
    Post-Json "$Api/execution-tasks/$TaskId/executions/$ExecutionId/events" @{
        eventType = $Type; eventKey = $Key; eventContent = $Content
        eventDataJson = $eventJson; createdBy = 'execution-e2e-test'
    } | Out-Null
}
function Test-ExecutionAttachment([long]$TaskId, [long]$ExecutionId) {
    Add-Type -AssemblyName System.Net.Http
    $bytes = [Convert]::FromBase64String('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/2ioAAAAASUVORK5CYII=')
    $client = New-Object System.Net.Http.HttpClient
    $form = New-Object System.Net.Http.MultipartFormDataContent
    try {
        $content = New-Object System.Net.Http.ByteArrayContent -ArgumentList (,$bytes)
        $content.Headers.ContentType = [System.Net.Http.Headers.MediaTypeHeaderValue]::Parse('image/png')
        $form.Add($content, 'file', 'e2e-proof.png')
        $uploadUri = "$Api/execution-tasks/$TaskId/executions/$ExecutionId/attachments?type=SCREENSHOT&createdBy=execution-e2e-test"
        $upload = $client.PostAsync($uploadUri, $form).GetAwaiter().GetResult()
        $uploadBody = $upload.Content.ReadAsStringAsync().GetAwaiter().GetResult()
        if (-not $upload.IsSuccessStatusCode) { throw "Evidence upload failed: HTTP $([int]$upload.StatusCode) $uploadBody" }
        $metadata = $uploadBody | ConvertFrom-Json
        $downloadUri = "$Api/execution-tasks/$TaskId/executions/$ExecutionId/attachments/$($metadata.id)"
        $download = $client.GetByteArrayAsync($downloadUri).GetAwaiter().GetResult()
        if ([Convert]::ToBase64String($download) -ne [Convert]::ToBase64String($bytes)) {
            throw 'Downloaded evidence bytes differ from the uploaded file.'
        }
        $detail = Invoke-RestMethod -Uri "$Api/execution-tasks/$TaskId" -Method Get -TimeoutSec 20
        $execution = @($detail.executions | Where-Object { $_.id -eq $ExecutionId })[0]
        $attachment = @($execution.attachments | Where-Object { $_.id -eq $metadata.id })[0]
        if (-not $attachment -or $attachment.fileName -ne 'e2e-proof.png') {
            throw 'Uploaded evidence metadata is missing from the execution detail.'
        }
        return $metadata
    } finally {
        $form.Dispose()
        $client.Dispose()
    }
}
function Ensure-NodeRunner {
    $pattern = 'node-runner\runner.mjs'
    $process = Get-CimInstance Win32_Process | Where-Object {
        $_.CommandLine -and $_.CommandLine.Replace('/', '\').Contains($pattern)
    } | Select-Object -First 1
    if ($process) { Write-Output "Node Runner already running: PID=$($process.ProcessId)"; return }
    $ps = Join-Path $env:WINDIR 'System32\WindowsPowerShell\v1.0\powershell.exe'
    & $ps -NoProfile -ExecutionPolicy Bypass -File (Join-Path $Root 'scripts\start-node-runner.ps1')
    if ($LASTEXITCODE -ne 0) { throw 'Could not start Node Runner.' }
    Write-Output "Node Runner started: PID=$((Get-Content (Join-Path $Root 'logs\node-runner.pid') -Raw).Trim())"
}
function New-Case([string]$No, [string]$Title, [string]$Mode, [string]$DataJson, [string]$AiInstruction, [long]$ScriptId, [object[]]$Steps, [string]$Expected) {
    $body = @{
        caseNo = $No; title = $Title; status = 'ACTIVE'; ownerName = 'execution-e2e-test'
        preconditions = 'Local development environment is running'; steps = $Steps
        expectedResult = $Expected; testType = 'API'; priority = 'HIGH'
        executionMode = $Mode; testDataJson = $DataJson; requirementIds = @()
        createdBy = 'execution-e2e-test'
    }
    if ($Mode -eq 'SCRIPT') { $body.Add('scriptId', $ScriptId) } else { $body.Add('aiInstruction', $AiInstruction) }
    return (Post-Json "$Api/test-cases" $body)
}
function New-Cycle([string]$Name, [object[]]$CaseIds, [string]$CodeVersion) {
    Post-Json "$Api/test-cycles" @{
        versionId = $VersionId; cycleName = $Name; cycleStage = 'LOCAL_DEV'
        environmentId = $EnvironmentId; codeVersion = $CodeVersion
        gitBranch = 'local-execution-e2e'; buildNo = $Stamp
        description = 'Repeatable local execution E2E; test records are retained.'
        caseIds = $CaseIds; createdBy = 'execution-e2e-test'
    }
}
function New-CycleTask([long]$CycleId, [string]$Key, [string]$Trigger) {
    Post-Json "$Api/test-cycles/$CycleId/execution-tasks" @{
        idempotencyKey = $Key; requestedBy = 'execution-e2e-test'; triggerSource = $Trigger
    } | Out-Null
}

function Get-ChatGptQueueItems {
    $response = Invoke-WebRequest -Uri "$Api/execution-tasks/claimable/chatgpt?limit=20" -UseBasicParsing -TimeoutSec 20
    return ($response.Content | ConvertFrom-Json)
}
function Wait-Parent([long]$ParentId) {
    $count = [Math]::Max(1, [int][Math]::Ceiling($WaitSeconds / 2))
    for ($i = 0; $i -lt $count; $i++) {
        $detail = Invoke-RestMethod -Uri "$Api/execution-tasks/$ParentId" -Method Get -TimeoutSec 20
        $children = @($detail.children)
        $pending = @($children | Where-Object { $_.taskStatus -notin @('COMPLETED','FAILED','CANCELLED') })
        if ($children.Count -gt 0 -and $pending.Count -eq 0) { return $detail }
        Start-Sleep -Seconds 2
    }
    throw "Timed out waiting for parent task $ParentId."
}
function Latest-Execution($Child) { @($Child.executions | Sort-Object attemptNo -Descending)[0] }

Write-Output '--- Validate local app and non-production environment ---'
$health = Invoke-RestMethod -Uri "$Api/health" -Method Get -TimeoutSec 8
if ($health.status -ne 'UP') { throw 'Management application is not healthy.' }
$environment = Invoke-RestMethod -Uri "$Api/environments/$EnvironmentId" -Method Get -TimeoutSec 10
if (-not $environment.active -or $environment.environmentType -eq 'PROD') { throw 'Selected environment must be active and non-PROD.' }
$version = Invoke-RestMethod -Uri "$Api/versions/$VersionId" -Method Get -TimeoutSec 10
Write-Output "APP=UP; ENV=$($environment.environmentCode)/$($environment.environmentType); VERSION=$($version.versionNo)"
Ensure-NodeRunner

Write-Output '--- Node Runner PASS/FAIL E2E ---'
$nodeSource = @(
    'function main(ctx) {'
    '  console.log("Executing", ctx.case.caseNo);'
    '  assert.equal(typeof process, "undefined", "host process is isolated");'
    '  assert.equal(typeof require, "undefined", "host require is isolated");'
    '  assert.equal(typeof fetch, "undefined", "network API is not exposed");'
    '  assert.equal(ctx.case.testData.status, ctx.args.expectedStatus, "status matches expected");'
    '  return { caseNo: ctx.case.caseNo };'
    '}'
) -join [Environment]::NewLine
$scriptRecord = Post-Json "$Api/test-scripts" @{
    scriptCode = "DPM-NODE-E2E-$Stamp"; scriptName = "Node Runner E2E $Stamp"
    scriptLanguage = 'NODE'; runtimeVersion = 'QuickJS WASM 0.32.0'
    scriptVersion = '1.0.0'; sourceType = 'INLINE'; sourceContent = $nodeSource
    entryPoint = 'main'; argumentsJson = '{"expectedStatus":"READY"}'
    description = 'Repeatable QuickJS WASM runner integration test'
    enabled = $true; createdBy = 'execution-e2e-test'
}
$nodeSteps = @(@{ action = 'Run QuickJS assertions'; expectedResult = 'Host APIs hidden and status matches expected value' })
$nodePass = New-Case "DPM-NODE-PASS-$Stamp" "Node Runner PASS $Stamp" 'SCRIPT' '{"status":"READY"}' $null $scriptRecord.id $nodeSteps 'All four assertions pass'
$nodeFail = New-Case "DPM-NODE-FAIL-$Stamp" "Node Runner FAIL $Stamp" 'SCRIPT' '{"status":"NOT_READY"}' $null $scriptRecord.id $nodeSteps 'Status assertion fails; isolation assertions pass'
$nodeCycle = New-Cycle "Node Runner E2E $Stamp" @([long]$nodePass.id,[long]$nodeFail.id) 'NODE-QUICKJS-E2E'
Invoke-RestMethod -Uri "$Api/test-cycles/$($nodeCycle.id)/start" -Method Post -TimeoutSec 20 | Out-Null
New-CycleTask -CycleId ([long]$nodeCycle.id) -Key "NODE-E2E-$Stamp" -Trigger 'USER'
$nodeTaskPage = Invoke-RestMethod -Uri "$Api/execution-tasks?cycleId=$($nodeCycle.id)&pageNum=1&pageSize=10" -Method Get -TimeoutSec 20
$nodeParent = @($nodeTaskPage.list | Where-Object { $_.taskType -eq 'EXECUTE_CYCLE' })[0]
if (-not $nodeParent) { throw "Node Runner parent execution task was not created for cycle $($nodeCycle.id)." }
$nodeParentId = [long]$nodeParent.id
$nodeDetail = Wait-Parent $nodeParentId
$nodeResults = @{}
$nodePassChild = $null
foreach ($child in @($nodeDetail.children)) {
    $execution = Latest-Execution $child
    $nodeResults[$child.caseNo] = $execution.result
    Write-Output "NODE_CASE=$($child.caseNo); TASK=$($child.taskStatus); RESULT=$($execution.result)"
    if ($child.caseNo -eq $nodePass.caseNo) { $nodePassChild = $child }
}
if (-not $nodePassChild) { throw 'Node Runner PASS execution child is missing.' }
$nodePassExecution = Latest-Execution $nodePassChild
$nodeEvidence = Test-ExecutionAttachment -TaskId ([long]$nodePassChild.id) -ExecutionId ([long]$nodePassExecution.id)
Write-Output "EVIDENCE_ATTACHMENT=$($nodeEvidence.id); UPLOAD_DOWNLOAD=PASS; SHA256=$($nodeEvidence.sha256)"
$nodeCycleDetail = Invoke-RestMethod -Uri "$Api/test-cycles/$($nodeCycle.id)" -Method Get -TimeoutSec 20
if ($nodeDetail.task.taskStatus -ne 'COMPLETED' -or $nodeResults[$nodePass.caseNo] -ne 'PASS' -or
        $nodeResults[$nodeFail.caseNo] -ne 'FAIL' -or $nodeCycleDetail.status -ne 'COMPLETED') {
    throw 'Node Runner PASS/FAIL or automatic cycle-completion E2E result mismatch.'
}

Write-Output '--- ChatGPT queue + human requeue E2E ---'
$aiSteps = @(@{ action = 'GET local health endpoint'; expectedResult = 'HTTP 200 and JSON status UP' })
$aiAuto = New-Case -No "DPM-CHATGPT-AUTO-$Stamp" -Title "ChatGPT auto E2E $Stamp" -Mode 'AI' -DataJson '{"url":"/api/health","expectedStatus":"UP"}' -AiInstruction 'Call only local GET /api/health; assert HTTP 200 and JSON.status=UP. Do not access external networks or credentials.' -ScriptId 0 -Steps $aiSteps -Expected 'Local health endpoint returns HTTP 200 and status UP'
$aiHuman = New-Case -No "DPM-CHATGPT-HUMAN-$Stamp" -Title "ChatGPT human E2E $Stamp" -Mode 'AI' -DataJson '{"url":"/api/health","expectedStatus":"UP","requiresHumanConfirmation":true}' -AiInstruction 'Request operator confirmation first. After confirmation, call local GET /api/health and assert HTTP 200 and JSON.status=UP.' -ScriptId 0 -Steps $aiSteps -Expected 'Operator confirms and local health endpoint returns HTTP 200 and status UP'
$aiCaseIds = @([long]$aiAuto.id, [long]$aiHuman.id)
$aiCycle = New-Cycle -Name "ChatGPT E2E $Stamp" -CaseIds $aiCaseIds -CodeVersion 'CHATGPT-QUEUE-E2E'
Invoke-RestMethod -Uri "$Api/test-cycles/$($aiCycle.id)/start" -Method Post -TimeoutSec 20 | Out-Null
New-CycleTask -CycleId ([long]$aiCycle.id) -Key "CHATGPT-E2E-$Stamp" -Trigger 'CHATGPT'
$taskPage = Invoke-RestMethod -Uri "$Api/execution-tasks?cycleId=$($aiCycle.id)&pageNum=1&pageSize=10" -Method Get -TimeoutSec 20
$parent = @($taskPage.list | Where-Object { $_.taskType -eq 'EXECUTE_CYCLE' })[0]
if (-not $parent) { throw "Parent execution task was not created for cycle $($aiCycle.id)." }
$aiParentId = [long]$parent.id
$queue = @()
$autoQueueItem = $null
$humanQueueItem = $null
for ($i = 0; $i -lt 10; $i++) {
    $queue = Get-ChatGptQueueItems
    $autoQueueItem = @($queue | Where-Object { $_.execution.requestSnapshot.caseSnapshot.caseNo -eq $aiAuto.caseNo })[0]
    $humanQueueItem = @($queue | Where-Object { $_.execution.requestSnapshot.caseSnapshot.caseNo -eq $aiHuman.caseNo })[0]
    if ($autoQueueItem -and $humanQueueItem) { break }
    Start-Sleep -Seconds 1
}
if (-not $autoQueueItem -or -not $humanQueueItem) { throw 'Both newly created AI cases did not appear in the ChatGPT queue.' }

foreach ($case in @($aiAuto,$aiHuman)) {
    $item = @($queue | Where-Object { $_.execution.requestSnapshot.caseSnapshot.caseNo -eq $case.caseNo })[0]
    if (-not $item -or -not $item.execution.requestSnapshot.caseSnapshot.aiInstruction) { throw "AI snapshot missing for $($case.caseNo)." }
    $taskId = [long]$item.task.id
    $executionId = [long]$item.execution.id
    Post-Json "$Api/execution-tasks/$taskId/executions/$executionId/start" @{ actor='CHATGPT'; executorName='ChatGPT E2E simulator' } | Out-Null
    Add-Event $taskId $executionId 'STEP_STARTED' "chatgpt-$executionId-start" 'Start AI test case' @{ caseNo=$case.caseNo }

    if ($case.id -eq $aiHuman.id) {
        Add-Event $taskId $executionId 'WAITING_HUMAN' "chatgpt-$executionId-wait" 'Waiting for simulated operator confirmation' @{ reason='Repeatable human-intervention E2E' }
        $waiting = Invoke-RestMethod -Uri "$Api/execution-tasks/$taskId" -Method Get -TimeoutSec 20
        if ($waiting.task.taskStatus -ne 'WAITING_HUMAN') { throw 'Task did not enter WAITING_HUMAN.' }
        Post-Json "$Api/execution-tasks/$taskId/human-intervention" @{
            decision='CONFIRMED'; note='Simulated operator confirms continuation of a read-only local health check.'
            decidedBy='execution-e2e-simulated-operator'
        } | Out-Null
        $again = @(Get-ChatGptQueueItems | Where-Object { $_.task.id -eq $taskId })[0]
        if (-not $again -or $again.execution.attemptNo -ne $item.execution.attemptNo) { throw 'Human-confirmed task did not requeue on the same attempt.' }
        Post-Json "$Api/execution-tasks/$taskId/executions/$executionId/start" @{ actor='CHATGPT'; executorName='ChatGPT E2E simulator resumed' } | Out-Null
    }

    Add-Event $taskId $executionId 'CHECKPOINT' "chatgpt-$executionId-checkpoint" 'Ready to execute local health check' @{ nextStep='GET /api/health'; humanConfirmed=($case.id -eq $aiHuman.id) }
    Add-Event $taskId $executionId 'API_REQUEST' "chatgpt-$executionId-request" 'GET /api/health' @{ method='GET'; url="$BaseUrl/api/health" }
    $healthResult = Invoke-RestMethod -Uri "$BaseUrl/api/health" -Method Get -TimeoutSec 8
    Add-Event $taskId $executionId 'API_RESPONSE' "chatgpt-$executionId-response" 'HTTP 200' @{ statusCode=200; body=$healthResult }
    if ($healthResult.status -ne 'UP') { throw 'Local health assertion failed.' }
    Add-Event $taskId $executionId 'ASSERTION_PASSED' "chatgpt-$executionId-assert" 'health.status equals UP' @{ actual=$healthResult.status; expected='UP' }
    Add-Event $taskId $executionId 'STEP_COMPLETED' "chatgpt-$executionId-done" 'Local health check passed' @{ result='PASS' }
    Post-Json "$Api/execution-tasks/$taskId/executions/$executionId/complete" @{
        result='PASS'; actualResult='{"httpStatus":200,"status":"UP","assertions":1}'
        logExcerpt='ChatGPT E2E simulator checked the local health endpoint successfully.'
        executorName='ChatGPT E2E simulator'
    } | Out-Null
}

$aiDetail = Wait-Parent $aiParentId
foreach ($child in @($aiDetail.children)) {
    $execution = Latest-Execution $child
    Write-Output "CHATGPT_CASE=$($child.caseNo); TASK=$($child.taskStatus); RESULT=$($execution.result)"
    if ($child.taskStatus -ne 'COMPLETED' -or $execution.result -ne 'PASS') { throw 'ChatGPT E2E result mismatch.' }
}
if ($aiDetail.task.taskStatus -ne 'COMPLETED') { throw 'ChatGPT parent task did not complete.' }
$aiCycleDetail = Invoke-RestMethod -Uri "$Api/test-cycles/$($aiCycle.id)" -Method Get -TimeoutSec 20
if ($aiCycleDetail.status -ne 'COMPLETED' -or $aiCycleDetail.passCount -ne 2 -or
        $aiCycleDetail.failCount -ne 0 -or $aiCycleDetail.notRunCount -ne 0) {
    throw "ChatGPT cycle auto-completion/statistics mismatch: status=$($aiCycleDetail.status), pass=$($aiCycleDetail.passCount), fail=$($aiCycleDetail.failCount), notRun=$($aiCycleDetail.notRunCount)."
}

Write-Output '--- Concurrent ChatGPT start + checkpoint persistence + parent aggregation E2E ---'
$raceCase = New-Case -No "DPM-CHATGPT-RACE-$Stamp" -Title "ChatGPT concurrent start E2E $Stamp" -Mode 'AI' -DataJson '{}' -AiInstruction 'Execute only the local health check after the server grants the execution claim.' -ScriptId 0 -Steps $aiSteps -Expected 'Exactly one concurrent start succeeds; checkpoint persists; result aggregates to parent'
$raceCycle = New-Cycle -Name "ChatGPT concurrent start E2E $Stamp" -CaseIds @([long]$raceCase.id) -CodeVersion 'CHATGPT-CONCURRENT-START-E2E'
Invoke-RestMethod -Uri "$Api/test-cycles/$($raceCycle.id)/start" -Method Post -TimeoutSec 20 | Out-Null
New-CycleTask -CycleId ([long]$raceCycle.id) -Key "CHATGPT-CONCURRENT-START-$Stamp" -Trigger 'CHATGPT'
$raceParentPage = Invoke-RestMethod -Uri "$Api/execution-tasks?cycleId=$($raceCycle.id)&pageNum=1&pageSize=10" -Method Get -TimeoutSec 20
$raceParentRow = @($raceParentPage.list | Where-Object { $_.taskType -eq 'EXECUTE_CYCLE' })[0]
if (-not $raceParentRow) { throw 'Concurrent start E2E parent task was not created.' }
$raceParentId = [long]$raceParentRow.id
$raceQueueItem = $null
for ($i = 0; $i -lt 10; $i++) {
    $raceQueue = Get-ChatGptQueueItems
    $raceQueueItem = @($raceQueue | Where-Object { $_.execution.requestSnapshot.caseSnapshot.caseNo -eq $raceCase.caseNo })[0]
    if ($raceQueueItem) { break }
    Start-Sleep -Seconds 1
}
if (-not $raceQueueItem) { throw 'Concurrent start E2E case did not appear in the ChatGPT queue.' }
$raceTaskId = [long]$raceQueueItem.task.id
$raceExecutionId = [long]$raceQueueItem.execution.id
$startUri = "$Api/execution-tasks/$raceTaskId/executions/$raceExecutionId/start"
$startResults = @(Invoke-ConcurrentPost -Uri $startUri -Body @{ actor='CHATGPT'; executorName='Concurrent ChatGPT E2E' } -Count 2)
$startSuccessCount = @($startResults | Where-Object { $_.statusCode -eq 200 }).Count
$startConflictCount = @($startResults | Where-Object { $_.statusCode -eq 409 }).Count
if ($startSuccessCount -ne 1 -or $startConflictCount -ne 1) {
    throw "Concurrent ChatGPT start must yield exactly one HTTP 200 and one HTTP 409; got: $($startResults | ConvertTo-Json -Compress)"
}
$checkpointData = @{ nextStep='GET /api/health'; completedSteps=1; marker="checkpoint-$Stamp" }
Add-Event $raceTaskId $raceExecutionId 'CHECKPOINT' "chatgpt-race-$raceExecutionId-checkpoint" 'Persist concurrent-start checkpoint' $checkpointData
$raceAfterCheckpoint = Invoke-RestMethod -Uri "$Api/execution-tasks/$raceTaskId" -Method Get -TimeoutSec 20
$raceExecutionAfterCheckpoint = Latest-Execution $raceAfterCheckpoint
$persistedCheckpoint = $raceExecutionAfterCheckpoint.checkpointJson | ConvertFrom-Json
$checkpointEvent = @($raceExecutionAfterCheckpoint.events | Where-Object { $_.eventType -eq 'CHECKPOINT' })[0]
if ($persistedCheckpoint.marker -ne $checkpointData.marker -or -not $checkpointEvent) {
    throw 'Checkpoint JSON or its event was not persisted after concurrent start.'
}
Post-Json "$Api/execution-tasks/$raceTaskId/executions/$raceExecutionId/complete" @{
    result='PASS'; actualResult='Concurrent start produced one winner; checkpoint persisted.'
    logExcerpt='Concurrent start and checkpoint persistence E2E passed.'
    executorName='Concurrent ChatGPT E2E'
} | Out-Null
$raceParentDetail = Wait-Parent $raceParentId
$raceChildDetail = @($raceParentDetail.children | Where-Object { $_.caseNo -eq $raceCase.caseNo })[0]
$raceChildExecution = Latest-Execution $raceChildDetail
$raceCycleDetail = Invoke-RestMethod -Uri "$Api/test-cycles/$($raceCycle.id)" -Method Get -TimeoutSec 20
if ($raceParentDetail.task.taskStatus -ne 'COMPLETED' -or $raceChildDetail.taskStatus -ne 'COMPLETED' -or
        $raceChildExecution.result -ne 'PASS' -or $raceCycleDetail.status -ne 'COMPLETED') {
    throw 'Concurrent-start child result or automatic cycle completion was not correctly aggregated.'
}
Write-Output "CHATGPT_START_RACE=PASS; HTTP_200=$startSuccessCount; HTTP_409=$startConflictCount; CHECKPOINT=PERSISTED; PARENT=COMPLETED; CYCLE=$($raceCycleDetail.status)"

Write-Output '--- Cancellation versus completion concurrency E2E ---'
$abortRaceCase = New-Case -No "DPM-ABORT-RACE-$Stamp" -Title "Abort versus completion E2E $Stamp" -Mode 'AI' -DataJson '{}' -AiInstruction 'Read-only local test case used to verify completion and cycle-abort concurrency.' -ScriptId 0 -Steps $aiSteps -Expected 'Completion and cycle abort serialize without inconsistent task/execution states'
$abortRaceCycle = New-Cycle -Name "Abort versus completion E2E $Stamp" -CaseIds @([long]$abortRaceCase.id) -CodeVersion 'ABORT-COMPLETE-RACE-E2E'
Invoke-RestMethod -Uri "$Api/test-cycles/$($abortRaceCycle.id)/start" -Method Post -TimeoutSec 20 | Out-Null
New-CycleTask -CycleId ([long]$abortRaceCycle.id) -Key "ABORT-COMPLETE-RACE-$Stamp" -Trigger 'CHATGPT'
$abortRaceParentPage = Invoke-RestMethod -Uri "$Api/execution-tasks?cycleId=$($abortRaceCycle.id)&pageNum=1&pageSize=10" -Method Get -TimeoutSec 20
$abortRaceParentRow = @($abortRaceParentPage.list | Where-Object { $_.taskType -eq 'EXECUTE_CYCLE' })[0]
if (-not $abortRaceParentRow) { throw 'Abort/completion E2E parent task was not created.' }
$abortRaceParentId = [long]$abortRaceParentRow.id
$abortRaceBefore = Invoke-RestMethod -Uri "$Api/execution-tasks/$abortRaceParentId" -Method Get -TimeoutSec 20
$abortRaceChild = @($abortRaceBefore.children | Where-Object { $_.caseNo -eq $abortRaceCase.caseNo })[0]
$abortRaceExecution = Latest-Execution $abortRaceChild
if (-not $abortRaceChild -or -not $abortRaceExecution) { throw 'Abort/completion E2E child execution snapshot is missing.' }
$abortRaceTaskId = [long]$abortRaceChild.id
$abortRaceExecutionId = [long]$abortRaceExecution.id
Post-Json "$Api/execution-tasks/$abortRaceTaskId/executions/$abortRaceExecutionId/start" @{
    actor='CHATGPT'; executorName='Abort/completion concurrency E2E'
} | Out-Null
$raceCompleteUri = "$Api/execution-tasks/$abortRaceTaskId/executions/$abortRaceExecutionId/complete"
$raceAbortUri = "$Api/test-cycles/$($abortRaceCycle.id)/abort"
$raceCompleteBody = @{
    result='PASS'; actualResult='Completion raced with cycle abort.'
    logExcerpt='Concurrent completion/abort integration test.'
    executorName='Abort/completion concurrency E2E'
}
$raceMutationResults = @(Invoke-ConcurrentPostPair -FirstUri $raceCompleteUri -FirstBody $raceCompleteBody -SecondUri $raceAbortUri -SecondBody @{})
$raceCompleteResponse = @($raceMutationResults | Where-Object { $_.requestUri -eq $raceCompleteUri })[0]
$raceAbortResponse = @($raceMutationResults | Where-Object { $_.requestUri -eq $raceAbortUri })[0]
if ($raceCompleteResponse.statusCode -notin @(200,409) -or $raceAbortResponse.statusCode -notin @(200,400,409)) {
    throw "Unexpected completion/abort race responses: $($raceMutationResults | ConvertTo-Json -Compress)"
}
$abortRaceCycleAfter = Invoke-RestMethod -Uri "$Api/test-cycles/$($abortRaceCycle.id)" -Method Get -TimeoutSec 20
$abortRaceParentAfter = Invoke-RestMethod -Uri "$Api/execution-tasks/$abortRaceParentId" -Method Get -TimeoutSec 20
$abortRaceChildAfter = @($abortRaceParentAfter.children | Where-Object { $_.id -eq $abortRaceTaskId })[0]
$abortRaceExecutionAfter = Latest-Execution $abortRaceChildAfter
$completedConsistently = $abortRaceChildAfter.taskStatus -eq 'COMPLETED' -and $abortRaceExecutionAfter.executionStatus -eq 'COMPLETED' -and $abortRaceParentAfter.task.taskStatus -eq 'COMPLETED'
$cancelledConsistently = $abortRaceChildAfter.taskStatus -eq 'CANCELLED' -and $abortRaceExecutionAfter.executionStatus -eq 'CANCELLED' -and $abortRaceParentAfter.task.taskStatus -eq 'CANCELLED'
$completionWon = $abortRaceCycleAfter.status -eq 'COMPLETED' -and $completedConsistently -and
        $raceCompleteResponse.statusCode -eq 200 -and $raceAbortResponse.statusCode -in @(400,409)
$abortWon = $abortRaceCycleAfter.status -eq 'ABORTED' -and $cancelledConsistently -and
        $raceAbortResponse.statusCode -eq 200 -and $raceCompleteResponse.statusCode -eq 409
if (-not $completionWon -and -not $abortWon) {
    throw "Completion/abort race left inconsistent states: cycle=$($abortRaceCycleAfter.status), parent=$($abortRaceParentAfter.task.taskStatus), child=$($abortRaceChildAfter.taskStatus), execution=$($abortRaceExecutionAfter.executionStatus), completeHttp=$($raceCompleteResponse.statusCode), abortHttp=$($raceAbortResponse.statusCode)"
}
Write-Output "ABORT_COMPLETE_RACE=PASS; WINNER=$(if($completionWon){'COMPLETION'}else{'ABORT'}); COMPLETE_HTTP=$($raceCompleteResponse.statusCode); ABORT_HTTP=$($raceAbortResponse.statusCode); FINAL=$($abortRaceChildAfter.taskStatus)"

Write-Output '--- Cycle abort: cancel pending/running tasks and reject late requests ---'
$abortCycle = New-Cycle -Name "Cycle abort E2E $Stamp" -CaseIds @([long]$aiAuto.id,[long]$aiHuman.id) -CodeVersion 'CYCLE-ABORT-E2E'
Invoke-RestMethod -Uri "$Api/test-cycles/$($abortCycle.id)/start" -Method Post -TimeoutSec 20 | Out-Null
New-CycleTask -CycleId ([long]$abortCycle.id) -Key "CYCLE-ABORT-E2E-$Stamp" -Trigger 'CHATGPT'
$abortTaskPage = Invoke-RestMethod -Uri "$Api/execution-tasks?cycleId=$($abortCycle.id)&pageNum=1&pageSize=10" -Method Get -TimeoutSec 20
$abortParentRow = @($abortTaskPage.list | Where-Object { $_.taskType -eq 'EXECUTE_CYCLE' })[0]
if (-not $abortParentRow) { throw 'Abort E2E parent task was not created.' }
$abortParentId = [long]$abortParentRow.id
$abortBefore = Invoke-RestMethod -Uri "$Api/execution-tasks/$abortParentId" -Method Get -TimeoutSec 20
$abortRunningChild = @($abortBefore.children | Where-Object { $_.caseNo -eq $aiAuto.caseNo })[0]
$abortPendingChild = @($abortBefore.children | Where-Object { $_.caseNo -eq $aiHuman.caseNo })[0]
if (-not $abortRunningChild -or -not $abortPendingChild) { throw 'Abort E2E child task snapshots are missing.' }
$abortRunningExecution = Latest-Execution $abortRunningChild
$abortPendingExecution = Latest-Execution $abortPendingChild
if (-not $abortRunningExecution -or -not $abortPendingExecution) { throw 'Abort E2E execution snapshots are missing.' }
$abortRunningTaskId = [long]$abortRunningChild.id
$abortRunningExecutionId = [long]$abortRunningExecution.id
$abortPendingTaskId = [long]$abortPendingChild.id
$abortPendingExecutionId = [long]$abortPendingExecution.id
Post-Json "$Api/execution-tasks/$abortRunningTaskId/executions/$abortRunningExecutionId/start" @{
    actor='CHATGPT'; executorName='ChatGPT E2E simulator before abort'
} | Out-Null
$abortedCycle = Invoke-RestMethod -Uri "$Api/test-cycles/$($abortCycle.id)/abort" -Method Post -TimeoutSec 20
$abortAfter = Invoke-RestMethod -Uri "$Api/execution-tasks/$abortParentId" -Method Get -TimeoutSec 20
$abortedRunningChild = @($abortAfter.children | Where-Object { $_.id -eq $abortRunningTaskId })[0]
$abortedPendingChild = @($abortAfter.children | Where-Object { $_.id -eq $abortPendingTaskId })[0]
$abortedRunningExecution = Latest-Execution $abortedRunningChild
$abortedPendingExecution = Latest-Execution $abortedPendingChild
if (($abortedCycle.status -ne 'ABORTED') -or ($abortAfter.task.taskStatus -ne 'CANCELLED') -or ($abortedRunningChild.taskStatus -ne 'CANCELLED') -or ($abortedPendingChild.taskStatus -ne 'CANCELLED') -or ($abortedRunningExecution.executionStatus -ne 'CANCELLED') -or ($abortedPendingExecution.executionStatus -ne 'CANCELLED')) {
    throw 'Cycle abort did not cancel parent, pending/running children and their latest executions.'
}
$abortQueue = @(Get-ChatGptQueueItems)
if (@($abortQueue | Where-Object { $_.task.id -in @($abortRunningTaskId,$abortPendingTaskId) }).Count -gt 0) {
    throw 'An aborted cycle child is still visible in the ChatGPT claimable queue.'
}
$lateStartRejected = $false
try {
    Post-Json "$Api/execution-tasks/$abortPendingTaskId/executions/$abortPendingExecutionId/start" @{
        actor='CHATGPT'; executorName='ChatGPT E2E simulator after abort'
    } | Out-Null
} catch {
    if ($_.Exception.Response -and [int]$_.Exception.Response.StatusCode -eq 409) {
        $lateStartRejected = $true
    } else { throw }
}
if (-not $lateStartRejected) { throw 'A pending task from an aborted cycle accepted a late start request.' }
$lateCompleteRejected = $false
try {
    Post-Json "$Api/execution-tasks/$abortRunningTaskId/executions/$abortRunningExecutionId/complete" @{
        result='PASS'; actualResult='late result must be rejected'; executorName='ChatGPT E2E simulator after abort'
    } | Out-Null
} catch {
    if ($_.Exception.Response -and [int]$_.Exception.Response.StatusCode -eq 409) {
        $lateCompleteRejected = $true
    } else { throw }
}
if (-not $lateCompleteRejected) { throw 'A running task from an aborted cycle accepted a late completion result.' }
Write-Output "CYCLE_ABORT=$($abortCycle.id); PARENT=CANCELLED; PENDING/RUNNING_CHILDREN=CANCELLED; LATE_START/COMPLETE=REJECTED"

Write-Output '--- E2E SUMMARY ---'
Write-Output "NODE_CYCLE=$($nodeCycle.id); NODE_PARENT=$nodeParentId; PASS=1; FAIL=1; CYCLE_STATUS=$($nodeCycleDetail.status); EVIDENCE_UPLOAD_DOWNLOAD=PASS"
Write-Output "CHATGPT_CYCLE=$($aiCycle.id); CHATGPT_PARENT=$aiParentId; PASS=2; HUMAN_REQUEUE=PASS; CYCLE_STATUS=$($aiCycleDetail.status)"
Write-Output "CHATGPT_START_RACE_CYCLE=$($raceCycle.id); ONE_WINNER=PASS; CHECKPOINT=PERSISTED; PARENT=COMPLETED"
Write-Output "ABORT_COMPLETE_RACE_CYCLE=$($abortRaceCycle.id); CONSISTENT_FINAL_STATE=PASS; FINAL=$($abortRaceChildAfter.taskStatus)"
Write-Output 'E2E RESULT=PASS'
Write-Output 'Test records are retained in the local database for inspection.'

