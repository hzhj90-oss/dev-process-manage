# ChatGPT 执行审计与显式恢复测试

> 2026-11-11 第十六批，适用于 T14s 本地开发管理系统。无登录/权限功能，不改变生产环境约束。

## 主要功能

- 执行台的任务状态追踪显示最多 8 次 ChatGPT/AI 执行尝试，每次展示 attemptNo、executionId、状态、结果、事件数量、检查点是否存在。
- 每次显示最近 6 条事件的类型、时间和限定长度的脱敏内容；**绝不直接渲染检查点 JSON**。
- 「复制脱敏诊断摘要」只包含任务 ID、最新执行 ID、执行状态、每次尝试事件类型/时间与检查点有无标记。不会复制请求快照、检查点数据、事件正文或环境凭据。
- 切换追踪任务 ID 时即时清除旧详情，防止把上一任务摘要误当成当前任务。
- 待人工恢复状态可跳转执行任务页面，仍必须根据业务步骤风险人工确认恢复；只读审计不自动启动或重复执行任务。

## 显式真实数据库恢复验收

常规回归不会执行真实超时恢复测试：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\verify-local.ps1 -AuditDependencies -IncludeMySql -BrowserIntegration
```

只有在专用本地验证环境、用户明确选择允许新增验证记录时，才运行：

```powershell
$env:DPM_AI_RECOVERY_E2E_ALLOW_WRITE = 'YES'
$env:DPM_AI_RECOVERY_E2E_VERSION_ID = '4'
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\verify-local.ps1 -AiRecoveryRealDb
Remove-Item Env:\DPM_AI_RECOVERY_E2E_ALLOW_WRITE, Env:\DPM_AI_RECOVERY_E2E_VERSION_ID
```
这个可选入口在运行全部测试之前先检查显式写入许可、验证版本 ID、管理端健康与是否存在 RUNNING 任务。底层真实验收脚本还再次校验 DPM-VERIFY 项目前缀、TEST/NONE 环境、专用用例和执行状态。没有显式开关的测试应立即失败，不能写入数据库。

**注意**：本批只验证新入口的默认拒绝与完整普通回归，未再次触发真实数据库 E2E，也没有新建测试轮次。上一批完整真实验收证据仍为 cycle 46 / task 113 / execution 77 → 78 / PASS。

## 本地验证结果

- `aiAudit.test.mjs` 新增 3 项，检查恢复后的多次执行历史、诊断摘要不含敏感内容、过滤非法或不匹配执行及上限。
- `verify-local.ps1 -AiRecoveryRealDb` 在没有双重显式许可时退出码 1，未进入测试流程；脚本 PowerShell 解析无错误。
- 生产 Vite 构建和 Spring Boot Maven clean verify 成功；Java 55 项（54 通过、1 Windows symlink 跳过）。
- Chrome 11/11 页面冒烟通过；新增 ChatGPT 审计 UI 断言为 `audit=2 postRequests=0`。
- 完整 `verify-local.ps1 -AuditDependencies -IncludeMySql -BrowserIntegration` 通过：HTTP 7、Node 11、Browser 策略 12、MySQL 5，ChatGPT 21 项，三套 npm 审计 0 已知漏洞。

## 下一步

继续优化人工作业交接的任务筛选与审计可检索性；实现 Python/Java Runner 前必须先证明隔离环境与资源边界；数据库还原需要独立权限与隔离目标库，不能直接覆盖现有库。
