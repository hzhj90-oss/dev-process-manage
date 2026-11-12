# ChatGPT 审计检索与 CSV 导出

> 第十七批，2026-11-11。T14s 本地 `D:\code\dev-process-manager`；不包含登录/权限，不提交或推送 Git。

## 使用方法

打开 `http://127.0.0.1:18090/#/ai-execution`，在「ChatGPT 执行审计检索」卡片按用例编号、任务编号、轮次名称、任务状态、执行结果筛选；还可勾选「仅中断恢复记录」。列表提供「查看历史」进入下方任务状态追踪，仍可复制只读的脱敏诊断摘要。

「导出筛选结果 CSV」按已经**点击查询**后生效的筛选条件重新从第一页读取，最多导出 500 条。输入条件变化但未点击「查询」时禁用导出按钮，避免导错。导出采用 UTF-8 BOM、CRLF，Excel 可读取。导出内容按白名单只包含 ID、编号、项目、轮次、状态、最新尝试、执行结果、检查点是否存在、事件数量、创建时间；不导出快照、检查点 JSON、事件正文或环境凭据。CSV 单元格会转义双引号、逗号、控制字符，并为公式前缀添加文本保护。

> 注意：导出是多次分页只读查询，任务可能在此期间变化。若总数变化、出现重复或数据不完整，会停止下载并提示重新查询，不会声称导出了完整数据。

## 后端接口

`GET /api/execution-tasks/audit/chatgpt`，参数：

- `keyword`：任务编号、轮次名称或用例编号模糊检索，最大 100 字。
- `status`：PENDING/RUNNING/WAITING_HUMAN/RECOVERY_REQUIRED/COMPLETED/FAILED/CANCELLED。
- `result`：PASS/FAIL/BLOCKED/SKIPPED，匹配最新执行记录。
- `recoveredOnly`：true 表示同任务存在至少一次 `INTERRUPTED` 执行，且最新 attemptNo 大于 1。
- `pageNum` / `pageSize`：页码从 1 开始，单页不超过 50 条。

返回 `PageResult`，仅查询最新 CHATGPT/AI attempt 的审计元数据。过滤条件由 MyBatis 参数绑定，不拼接客户端 SQL；不修改数据或表结构。

## 实际验证

- 本地真实数据库只读查询：ChatGPT 任务 **42** 条，「曾中断并恢复」**3** 条；`keyword=TC-AI-RECOVERY-E2E-20261111&result=PASS` 精确找到任务 113、execution 78。
- 导出安全测试（3 项）：只导出白名单、消除公式注入与敏感值、超过 500 条拒绝。
- 后端新增 2 项单测，涵盖状态/结果/分页/关键字合法性与查询参数绑定。Java 总计 57（56 通过、1 个 Windows symlink 跳过）。
- Chrome 交互：筛选更改后导出禁用、点击查询、真实 CSV 下载、下载文件内容、无任务写入均通过，`filteredExport=true postRequests=0`。
- 前端 Chrome 11/11 页面冒烟通过，完整 `scripts/verify-local.ps1 -AuditDependencies -IncludeMySql -BrowserIntegration` 回归通过（ChatGPT 24、HTTP 7、Node 11、Browser DSL 12、MySQL 5，npm 三个目录审计 0 已知漏洞）。

## 后续边界

- 现有 `backup-database.ps1`、`verify-database-backup.ps1` 已验证备份完整性，但尚未对独立库实做恢复；现有 HTTP/Node/Browser 三类 Runner 已部署，Python/Java 任意代码执行必须先证明隔离资源和凭据安全，再启用。
- 下一批优先设计**独立目标库、无覆盖原库权限**的备份还原验收；不可在宿主机直接执行不可信 Python/Java 测试脚本。
