# ChatGPT 任务断点恢复与续执行

> 开发日期：2026-11-11。仅面向 T14s 本地、非生产环境，不引入登录与权限功能。

## 使用路径

1. 打开 `http://127.0.0.1:18090/#/ai-execution`，在“任务状态追踪”输入任务 ID。
2. 当最新执行为 `RUNNING/RUNNING` 时，出现“生成续执行指令”：沿用原 executionId，**不能再次 start**，应核对检查点、历史事件与外部真实状态。
3. 当人工恢复已创建新记录、且继承有效检查点时，`PENDING/QUEUED` 出现“生成续执行指令”：重新核对最新 executionId 与前次中断记录，只允许对新记录 start 一次。
4. 当 `RECOVERY_REQUIRED/INTERRUPTED` 时，出现“查看人工恢复指引”：由用户进入执行任务页检查风险并输入“恢复”，系统创建新 attempt；必须重新查询 ID，旧 executionId 不可继续写入。
5. `WAITING_HUMAN`、已完成、生产环境、错误 Runner、损坏快照都不提供自动续执行入口。

## 本地 CLI

- `node D:\code\dev-process-manager\scripts\chatgpt-task.mjs status TASK_ID`：读取当前状态。
- `node D:\code\dev-process-manager\scripts\chatgpt-task.mjs plan TASK_ID EXEC_ID`：**只读**检查任务、最新执行 ID、是否存在继承检查点、最后 12 个脱敏事件和下一步操作类型。
- `node D:\code\dev-process-manager\scripts\chatgpt-task.mjs inspect TASK_ID`：读取脱敏的用例环境快照与检查点。
- `plan` 的 `nextAction` 为 `CONTINUE_RUNNING`、`START_RECOVERED`、`MANUAL_RECOVERY`、`STOP`。STOP、人工暂停、过期 ID 均不得写入。

## 安全与限制

- 指令只携带任务 ID 和操作约束，**不复制原始快照、凭据、检查点或事件正文**。
- CLI plan 返回检查点与有限历史事件的脱敏结果；无法确认幂等性的业务操作必须经人工核对，不盲目重做。
- 这不是无人值守 AI Worker，也不会跨会话自行运行；用户须把指令交给具备 T14s 本地连接的 ChatGPT 执行。
- 所有恢复操作仍由现有后端事务和状态校验保护；未修改表结构、未推送 Git。

## 验证

- 新增前端 `aiResume.test.mjs` 4 项；CLI mock 增至 9 项；两组合计 13/13 通过。
- 生产构建成功；Maven Java 55 项（54 通过、1 Windows 符号链接测试跳过）。
- 实际 Chrome：11/11 页面冒烟通过；ChatGPT 执行台续执行按钮、复制指令、敏感信息不泄露检查通过，POST 请求数 0。
- `scripts/verify-local.ps1 -AuditDependencies -IncludeMySql -BrowserIntegration` 全通过，MySQL 5/5、HTTP 7/7、QuickJS 11/11、Browser 策略 12/12；三套依赖审计均无已知高于 moderate 的安全告警。

## 下一断点

1. 续执行时验证真实中断任务在人工恢复后继承检查点并进入新 attempt（仅使用专用验证用例，先确认无外部副作用）。
2. 补足 ChatGPT 执行台对长期 RUNNING、WAITING_HUMAN 的到期提醒以及交接指引。
3. 隔离环境内的 Python/Java Runner 与隔离数据库恢复演练。
