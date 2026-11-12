# 第二十八批：测试轮次详情与 ChatGPT 队列/追踪异步竞态验收

日期：2026-11-12。本地项目 `D:\code\dev-process-manager`。目标仍是已实现模块稳定可用，不开发 Docker、Python/Java Runner、登录权限；无用户明确要求不 Git commit/push。

## 修复内容

### 测试轮次详情（TestCycleListView.vue）

旧逻辑 `openDetail(row)` 请求完成后才显示弹窗；快速点击其它轮次、关闭或对网络超时重试时，迟到的响应可能覆盖较新的选择，也没有持久的错误提示。

- 复用 `frontend/src/utils/latestRequest.js` 的递增请求 token。响应仅在 token 仍是最新、弹窗未关闭时生效。
- 点「详情」立即打开弹窗，显示加载状态；发生 GET 503/网络失败时保留弹窗，显示「重试读取轮次详情」。
- 关闭弹窗即使尚在加载中也会使该请求失效；新旧轮次不复用旧详情。
- 成功响应核对 `id` 和 `cases` 数组，不接受其它轮次的结果。
- 轮次原来的新建、编辑、开始、终止、增加/移除用例和执行创建逻辑未变；没有新增自动任务。

### ChatGPT 执行台（AiExecutionWorkbenchView.vue）

原队列刷新每次结果都会写入表格，导致较早请求晚到时可能恢复已经过期的待执行任务。任务追踪在手动操作和 10 秒自动刷新并发时还存在 A→B→A 的 ABA 竞态：仅按当前输入 ID 检查不足以区别第一次 A 与最后一次 A。

- 为队列请求增加 `queueGate`；仅最新请求能改变 `queue/loading/errorMessage`。
- 为任务追踪增加 `trackingGate`；输入任务 ID 变化时同步失效旧请求，手动查询和定时刷新之间也互相隔离。旧响应、旧异常及旧 `finally` 都不能覆盖最新数据、错误与加载状态。
- 响应必须是当前任务 ID，且包含执行尝试数组；不匹配返回错误而不展示错误任务的数据。
- 卸载页面时让队列、追踪及审计请求失效，停止定时器。
- 不更改 ChatGPT 执行协议、自动领取行为、恢复策略或审计导出内容。

## 自动化

新增 `runner/browser-runner/browser-cycle-ai-async-smoke.mjs`，加入 `scripts/test-browser-integration.ps1`，在 Playwright **无头 Chrome** 下使用模拟 GET 响应：

1. 点击测试轮次 A 的详情并阻塞响应，关闭弹窗再打开 B，模拟 B 首次 503、再次成功。A 最后返回时不得把 B 覆盖。
2. ChatGPT 队列首次加载阻塞，手动刷新成功后再返回旧队列。最新队列必须不受旧响应污染。
3. 追踪任务 ID A，阻塞首次 A；切换 B，再切回 A 重新读取。第一次 A 晚返回时不允许覆盖最新 A 结果。
4. 全程没有 POST/PUT/DELETE 请求真实后端，且不允许 Vue 页面运行时错误。

专项结果：

```
BROWSER_CYCLE_AI_ASYNC_PASS cycleClosedStaleIgnored=true cycleRetry=true queueStaleIgnored=true trackingABAProtected=true backendWrites=0
```

## 生产构建与集成验收

- Element Plus 导入/常见模板事件处理函数检查通过，Vite 生产构建通过。
- Maven `clean verify`：Java 71 项，70 项通过、1 项受 Windows symlink 权限限制跳过，0 个失败。
- 重启前确认 `RUNNING_TASKS=0`，通过 Tunnel 无窗口方式重新打包并部署到唯一端口 `127.0.0.1:18090`。部署后 PID **36528**，业务健康 `UP`。
- `scripts/verify-local.ps1 -AuditDependencies -IncludeMySql -BrowserIntegration` **退出码 0**。MySQL 独立表 6/6、HTTP/Node/Browser、ChatGPT 测试协议、全部真实 Chrome 回归、三个 npm 依赖审计均通过。
- 只读对账 47 个轮次、75 条用例、80 个尝试，统计硬错误 0；父子任务 49 根、38 整轮父、66 子，硬错误 0。历史 22 条轮次状态警告原样保留，不批量更正。
- 本批仅修改前端、无头浏览器测试和文档，没有 DDL、没有真实数据库写入，没有 Git commit/push。

## 后续断点

继续针对操作流程中异常提示、并发操作和长时间运行可靠性做收尾；不要为了少量 UI 改动虚报完成度上涨。仍执行无可见窗口方式的 T14s Tunnel 命令。观察此前 Windows 计划任务切换到 `wscript.exe` 后是否还有 CMD 闪窗；若用户反馈继续发生，应依据时间定位新进程来源，不要反复改正常的守护任务。
