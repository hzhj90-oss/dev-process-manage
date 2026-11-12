# ChatGPT 动态任务执行工具与真实验收

日期：2026-11-11；项目：`D:\code\dev-process-manager`；运行于 T14s Windows 本地。

## 目标和边界

此前「ChatGPT 执行台」可以查询待执行 AI 用例和复制交接指令，但 ChatGPT 需要手工构造多个 HTTP POST 请求，容易使用旧的 executionId、遗漏步骤事件或误判执行完成。

新增 Node.js 原生（不引入第三方依赖）执行工具：
- `scripts/chatgpt-task-client.mjs`：最小化本地任务执行协议客户端
- `scripts/chatgpt-task.mjs`：供具备 T14s Tunnel / 本机终端能力的 ChatGPT 调用的命令入口
- `scripts/chatgpt-task-client.test.mjs`：独立模拟服务的状态机、错误、输入和敏感信息测试

本工具自身**不是大语言模型、不会自行生成测试逻辑或执行任意代码**；由 ChatGPT 在会话中阅读用例并选择执行步骤。客户端只调用本机 DPM 的已有任务 API，不新增数据库表，不改现有 Runner 任务租约机制，也不开发登录和权限功能。

## 使用示例

在 T14s PowerShell 中：

```powershell
cd D:\code\dev-process-manager
node .\scripts\chatgpt-task.mjs queue
node .\scripts\chatgpt-task.mjs inspect 29
node .\scripts\chatgpt-task.mjs status 29
```

`queue` 只显示待领任务标识；`inspect` 读取最新任务、用例、环境和检查点，过滤敏感字段。实际执行前需再次核对正在操作的是被授权的测试用例及其最新 executionId。

以下示例展示 CLI **命令格式**，不是让你再次执行已完成的任务 29：

```powershell
node .\scripts\chatgpt-task.mjs start <TASK_ID> <EXEC_ID>
node .\scripts\chatgpt-task.mjs event <TASK_ID> <EXEC_ID> STEP_STARTED step-1 "开始检查"
node .\scripts\chatgpt-task.mjs event <TASK_ID> <EXEC_ID> ASSERTION_PASSED assertion-1 "真实观察到的结果"
node .\scripts\chatgpt-task.mjs heartbeat <TASK_ID> <EXEC_ID>
node .\scripts\chatgpt-task.mjs human <TASK_ID> <EXEC_ID> human-1 "需要人工确认的原因"
node .\scripts\chatgpt-task.mjs complete <TASK_ID> <EXEC_ID> PASS "真实观察到的测试证据"
```

> 注意：`human` 会使当前执行转为 `WAITING_HUMAN`，**之后不能直接 complete**；需由系统已有人工介入流程决定是否继续。以上命令是不同场景的语法参考，不应对同一次执行机械地全部运行。

## PowerShell 检查点的正确传递方式

Windows PowerShell 5.1 调用原生 Node 进程时，带双引号的 JSON 字符串可能被拆解，使后端收到不合法 JSON。本轮真实验收在中途发现并修复此问题。最稳妥方式是通过**标准输入**传递：

```powershell
$checkpoint = @{ step = 1; observed = 'UP'; source = 'local-health' } | ConvertTo-Json -Compress
$checkpoint | node .\scripts\chatgpt-task.mjs checkpoint <TASK_ID> <EXEC_ID> cp-1 -
```

末尾的 `-` 表示从标准输入读取 JSON，限制 50KB；客户端检查必须是 JSON 对象、对敏感键进行脱敏，并验证事件成功落库。测试输入不得包含真实的用户账号、密码、令牌或隐私数据。

## 内置防误操作规则

- CLI 默认只能访问 `http://127.0.0.1:18090`，不支持自动重定向，不连接外部网站。测试代码可以将同一客户端注入隔离的 `127.0.0.1` mock 端口。
- `start` 仅允许单用例、最新执行 ID、`CHATGPT` / `AI`、`PENDING` / `QUEUED`；运行中再次 start 会被拒绝。
- `event`、`checkpoint`、`heartbeat`、`human`、`complete` 仅允许同一最新尝试的 `RUNNING` 状态；生产环境任务拒绝处理。
- 任务状态在读取后仍可能被并发改动；**后端现有事务和状态约束是最终保障**。HTTP 冲突、超时或未知响应不会被当成执行成功。
- `complete` 必须提供真实观察到的实际结果；不允许任意结果值或空白证据，且完成后重新查询数据库状态。
- 对长时间执行的任务必须主动发送 `heartbeat`，客户端**不会后台保持心跳**；失联任务进入现有恢复流程，不自动重放具有副作用的步骤。
- 环境、用例和检查点只展示必要字段；敏感键、Bearer 值和常见密码/令牌赋值内容会隐藏。该过滤不等于可以安全处理任何真实凭据，因此依然不要将秘密输入测试日志。

## 本轮真实数据库验收

验收对象：专用测试项目 `Temporary Verification Project`，轮次 `ChatGPT E2E 20261110-123501`，任务 `29`，执行记录 `21`，原状态 `PENDING/QUEUED`。在开始前检查环境 URL 为 `127.0.0.1:18090`、认证类型 `NONE`、唯一测试步骤只需本地只读 `GET /api/health`。

实际执行步骤：
1. `start 29 21` → 数据库为 `RUNNING`
2. 记录 `STEP_STARTED`
3. 真实 HTTP GET `/api/health` → HTTP 200、JSON.status `UP`
4. 记录 `ASSERTION_PASSED`
5. 初次检查点因 Windows PowerShell 原生命令 JSON 参数转义失败被拒绝；**未标记 PASS，也未重新启动任务**
6. `heartbeat 29 21` 确认同一尝试仍有效
7. 使用 PowerShell 管道 + stdin 成功记录 `CHECKPOINT`，再记录 `STEP_COMPLETED`
8. 再次实际 GET 健康接口，核实仍为 `UP`，`complete 29 21 PASS`
9. 最终回读确认任务 `COMPLETED`、执行 `COMPLETED`、结果 `PASS`，事件合计 **8 条**，同时存在 `CHECKPOINT` 和 `ASSERTION_PASSED`。

只改变了该专用验证任务及其执行事件；没有处理剩余队列任务、没有调用任何外部环境写接口。

## 自动化测试

- 独立 Node `--test` 使用每用例独立的 localhost 模拟 HTTP 服务，不写真实数据库。
- 测试覆盖：仅允许本机地址、队列和检查的只读性、开始/完成状态机、步骤/检查点/心跳、人工暂停、过期 ID、生产环境拒绝、无效事件键、JSON/标准输入校验及敏感内容脱敏。
- Vue 指令测试检查工具引用、固定 task/execution ID 和脱敏。
- 真实 Chrome 测试验证执行台队列、复制指令、任务状态追踪和执行事件展示，确保**浏览器页面操作不会自动 POST 执行任务**。
- `scripts/verify-local.ps1` 已纳入 CLI mock 单测，`scripts/test-browser-integration.ps1` 负责端到端浏览器模拟验证。

## 后续仍未完成

这实现了 ChatGPT 会话可控执行的重复调用工具和一次真实数据库执行闭环，**尚不等于无人值守 AI 自动调度器**。自动化推理、工具调用和中断后续作仍需实际 ChatGPT 会话参与；Python/Java 任意脚本依然禁止在缺乏操作系统隔离时运行。

**Git：没有执行 commit/push；所有源码仍留在本地未提交工作区。**
