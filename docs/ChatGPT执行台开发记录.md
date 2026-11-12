# ChatGPT 执行台开发记录

日期：2026-11-11

## 需求边界

用户明确确认：**不需要系统登录和权限校验功能**。后续不开发这两项，也不计入“正常使用”的未完成项。系统当前仍以本机环回地址运行；若以后对局域网开放，需单独评估网络暴露范围，但不默认增加登录模块。

## 本轮完成

新增页面 `/#/ai-execution`，名称「ChatGPT 执行台」，已加入系统侧边栏。

- 使用已存在的只读接口 `GET /api/execution-tasks/claimable/chatgpt?limit=20` 展示当前可领取的 AI 执行任务。
- 列表展示任务编号、执行 ID、用例、测试轮次、环境、预期结果，支持手动刷新。
- 每条任务可以预览和复制「交给 ChatGPT 的执行指令」，包含任务及执行记录 ID，以及读取不可变快照、开始执行、逐步留痕、CHECKPOINT、人工确认、完成及复查的 API 流程。
- 复制只包含任务标识和执行流程，不复制原始环境配置、凭据或完整用例数据；拿到指令的 ChatGPT 必须通过可用本地连接重新读取快照，并在操作前核对最新任务状态。
- 本页面本身不会 claim、start、complete 或修改测试数据库；执行仍然必须由具备本地工具连接的 ChatGPT 在会话中完成，不能称为无人值守自动编排。
- 已使用现有后端接口，无需新增数据库表和后端鉴权模块。

## 相关文件

- `frontend/src/views/AiExecutionWorkbenchView.vue`
- `frontend/src/utils/aiHandoff.js`
- `frontend/src/utils/aiHandoff.test.mjs`
- `frontend/src/api/executionTasks.js`
- `frontend/src/router/index.js`
- `frontend/src/App.vue`
- `runner/browser-runner/browser-ai-handoff-smoke.mjs`
- `scripts/test-frontend-smoke.ps1`、`scripts/test-browser-integration.ps1`、`scripts/verify-local.ps1`

## 验证

- 指令构造单元测试 2/2：生成正确 taskId/executionId；拒绝任务已过期、执行方式不匹配或记录 ID 不一致；不复制环境凭据字段。
- 浏览器真实 Chrome 测试：队列模拟输入、指令预览、剪贴板复制成功，执行相关 POST 调用为 0。
- 前端生产构建通过，新增路由已打包入本地 Spring Boot JAR，并在后端 18090 可访问。
- 与现有 HTTP/Node/Browser Runner 共存，没有改变其任务协议。

## 未完成

- ChatGPT 从系统自动领取、运行和回写，而不依赖用户复制指令或在会话中发起。
- AI 执行跨会话中断恢复的自动编排和风险控制。
- Python/Java Runner 的 OS 级安全隔离与执行。

**Git 规则**：仅用户明确要求时 commit/push。本轮保留本地未提交改动。
