# Test-only helper: advance heartbeat for exactly one tagged local verification task.
# Never use against an ordinary task. No credentials are printed or placed in arguments.
param([Parameter(Mandatory=$true)][ValidateRange(1,999999999999999)][long]$TaskId,
      [Parameter(Mandatory=$true)][ValidateRange(1,999999999999999)][long]$ExecutionId)
$ErrorActionPreference = 'Stop'
if ($env:DPM_AI_RECOVERY_E2E_ALLOW_WRITE -ne 'YES') {
    throw 'Requires DPM_AI_RECOVERY_E2E_ALLOW_WRITE=YES'
}
$Root = Split-Path -Parent $PSScriptRoot
. (Join-Path $PSScriptRoot 'database-backup-common.ps1')
$Base = 'http://127.0.0.1:18090'
$Detail = Invoke-RestMethod "$Base/api/execution-tasks/$TaskId" -TimeoutSec 10
$Task = $Detail.task
$Execution = $Detail.executions[0]
if ($Task.taskType -ne 'EXECUTE_CASE' -or $Task.taskStatus -ne 'RUNNING' -or
    $Execution.executionStatus -ne 'RUNNING' -or
    $Execution.runnerType -ne 'CHATGPT' -or $Execution.executionMode -ne 'AI' -or
    [long]$Execution.id -ne $ExecutionId -or [long]$Execution.taskId -ne $TaskId) {
    throw 'Refusing to modify a task outside the active ChatGPT verification attempt.'
}
$Cycle = Invoke-RestMethod "$Base/api/test-cycles/$($Task.cycleId)" -TimeoutSec 10
$Version = Invoke-RestMethod "$Base/api/versions/$($Cycle.versionId)" -TimeoutSec 10
if (-not ([string]$Cycle.cycleName).StartsWith('AI Recovery E2E ') -or
    -not ([string]$Version.projectCode).StartsWith('DPM-VERIFY-') -or
    $Version.id -ne $Cycle.versionId) {
    throw 'Not a dedicated DPM-VERIFY test cycle.'
}
$Snapshot = $Execution.requestSnapshotJson | ConvertFrom-Json
if ($Snapshot.caseSnapshot.caseNo -notlike 'TC-AI-RECOVERY-E2E-*' -or
    $Snapshot.environmentSnapshot.environmentType -ne 'TEST' -or
    $Snapshot.environmentSnapshot.authType -ne 'NONE') {
    throw 'Unexpected case or test environment snapshot.'
}
$Config = Get-LocalDatabaseConfig
$MySql = Get-MySqlExecutable 'mysql.exe'
# SQL predicates double-check state and exact cycle + execution record to minimize races.
$Sql = @"
UPDATE dpm_execution_task
SET heartbeat_at = DATE_SUB(NOW(), INTERVAL 6 MINUTE)
WHERE id = $TaskId AND task_type = 'EXECUTE_CASE' AND task_status = 'RUNNING'
  AND lease_owner IS NULL AND heartbeat_at IS NOT NULL
  AND EXISTS (SELECT 1 FROM dpm_test_cycle c
    WHERE c.id = dpm_execution_task.cycle_id
      AND c.version_id = $([long]$Version.id) AND c.cycle_name LIKE 'AI Recovery E2E %')
  AND EXISTS (SELECT 1 FROM dpm_test_execution x
    WHERE x.task_id = dpm_execution_task.id
      AND x.id = $ExecutionId AND x.execution_status = 'RUNNING');
SELECT ROW_COUNT();
"@
$Args = @('--protocol=TCP', '--host=127.0.0.1', '--port=3306',
    "--user=$($Config.User)", "--database=$($Config.Name)",
    '--batch', '--skip-column-names', "--execute=$Sql")
$Output = @(Invoke-MySqlWithLocalCredentials -Executable $MySql -Arguments $Args -Config $Config)
if ($Output.Count -eq 0 -or $Output[-1].Trim() -ne '1') {
    throw 'The verification heartbeat was not advanced (expected exactly 1 updated row).'
}
Write-Host "VERIFICATION_HEARTBEAT_EXPIRED task=$TaskId execution=$ExecutionId"
