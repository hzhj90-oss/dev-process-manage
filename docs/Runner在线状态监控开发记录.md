# Runner 在线状态监控开发记录

日期：2026-11-11

## 背景与实现

原系统通过数据库任务租约控制领取、心跳、恢复，但在 Runner 空闲时没有独立的在线状态，因此用户无法区分“队列里没任务”和“对应执行器根本没启动”。

新增的在线监控复用既有经过共享 Token 认证的 `POST /api/runner/claim`：每次领取或空轮询都刷新 Runner 的最后联系时间；执行中通过有效租约验证的 heartbeat 同样刷新其状态。

新接口：`GET /api/runner/status`（只读），输出 `observedAt`、`offlineAfterSeconds`、`summary` 和 `runners`。

- HTTP、NODE、BROWSER 三类分别显示在线数、已见实例数和最近一次联系时间。
- 每条实例记录包括 `runnerId`、`runnerType`、`online`、`lastSeenAt`、`secondsSinceLastSeen`。
- 最近 30 秒收到有效请求：在线；超过 30 秒：离线；从未联系：未连接。
- 前端执行任务页每 10 秒刷新，支持手动刷新；关联固定脚本的排队任务如果没有在线 Runner 会显示针对性提示。
## 技术约束与安全

- `RunnerPresenceRegistry` 为线程安全的内存监控，**不新增表**，不保存共享 Token、租约 Token 或敏感快照。
- 仅经过有效共享 Token 的领取请求和有效任务租约 heartbeat 可更新在线状态；未授权或错误类型的请求不能伪造在线。
- 内存保留最多 256 个实例，历史未联系超过 24 小时自动移除；Spring Boot 重启会清空观察状态，执行器继续轮询后自动重新登记。
- 此处的“在线”表示执行器近期能够联系服务端，**不保证正在运行任务，也不代表任务一定可成功完成**。
- 不自动恢复旧任务、不自动重试有副作用的脚本，避免扩大现有任务语义或重复执行业务操作。
- 当前后端只监听本机回环地址。此只读状态端点暂随现有本地系统权限边界，未来如开放外网必须纳入系统登录鉴权。

## 相关实现

`backend/src/main/java/com/devprocess/manager/execution/service/RunnerPresenceRegistry.java`

`backend/src/main/java/com/devprocess/manager/execution/service/RunnerService.java`

`backend/src/main/java/com/devprocess/manager/execution/controller/RunnerController.java`

`frontend/src/views/ExecutionTaskListView.vue`、`frontend/src/api/runners.js`

`backend/src/test/java/com/devprocess/manager/execution/service/RunnerPresenceRegistryTest.java`

`runner/browser-runner/browser-runner-monitor-smoke.mjs`

## 验证

- Java 测试：完整 Maven 构建 55 项，54 项通过、1 项 Windows 符号链接权限跳过。
- 实际后端 `GET /api/runner/status` 返回 HTTP、NODE、BROWSER 各 1 个在线实例。
- Chrome 实际页面验证：三类在线状态均可展示；前端仅模拟响应验证 HTTP 在线、NODE 离线、BROWSER 未连接三种情况，未停止真实任务进程。
- 前端 `vite build` 和 10 个页面冒烟测试通过。
- 本地完整 `scripts/verify-local.ps1 -AuditDependencies -IncludeMySql -BrowserIntegration`：Java、MySQL、HTTP/Node/Browser、Chrome 交互、三套 npm 安全审计均通过。
- **无 Git commit / push**：本轮代码在本地工作区，遵守“用户明确要求才提交”的新规则。

## 下一步

完善需要人工介入的任务监控及 Runner 异常退出后的自动启动/告警；系统认证和权限保护需独立规划与回归，不能将测试口令直接硬编码到仓库。
