# Node Runner 开发与验证记录

更新日期：2026-11-10

## 1. 本阶段目标

实现固定脚本库中 NODE 类型脚本的独立执行器。由于当前 T14s 环境未安装 Windows Sandbox、Docker 或 WSL，当前登录账户也没有管理员权限，不能安全地通过 Windows 防火墙或系统级容器为原生 Node 进程隔离网络。

因此第一阶段不执行不受限的 Node.js 用户源码，而使用 QuickJS WebAssembly 解释器执行受限 JavaScript。没有使用 node:vm 作为安全边界。

## 2. 架构

- runner/node-runner/runner.mjs：独立宿主进程，负责 claim、heartbeat、事件上报和结果回传。
- runner/node-runner/sandbox.mjs：QuickJS WASM 沙箱，负责执行 JavaScript 入口函数、内存/栈/时间限制、日志和断言。
- runner/node-runner/sandbox.test.mjs：沙箱自动化测试。
- runner/node-runner/package.json：固定依赖 quickjs-emscripten 0.32.0。
- runner/node-runner/package-lock.json：锁定依赖树。
- scripts/start-node-runner.ps1：检查本地应用、Token、QuickJS 依赖并启动 Runner。
- scripts/stop-node-runner.ps1：只停止 PID 文件所指向且命令行确认是 Node Runner 的进程。

## 3. 沙箱能力边界

- JavaScript 源码在 QuickJS WebAssembly guest heap 内执行，不在宿主 Node.js 上执行。
- 不暴露 process、require、Node 文件系统、child_process、worker_threads、fetch、XMLHttpRequest、WebSocket、定时器和模块加载器。
- JavaScript 脚本不能通过宿主 API 访问管理平台网络客户端；管理平台通信仅由宿主 Runner 完成。
- 脚本入口为同步函数，默认 main(ctx)。
- ctx.case、ctx.args 为递归冻结的输入快照；ctx.environment 仅含环境代码、名称和类型，不包含凭据。
- 宿主只暴露 console.log/info/warn/error 和 assert.equal/deepEqual/ok/exists/contains。
- 必须至少执行一条断言；最多 100 条断言。
- 脚本源码最大 100 KiB（按 UTF-8 字节数校验）；输入快照最大 256 KiB。
- 执行超时 5 秒；QuickJS guest heap 32 MiB；最大栈 512 KiB。
- 日志最多保留 200 条、10,000 字符；返回值和断言值进行大小截断。
- v1 不支持 Node 原生模块、npm 包、文件读写、任意网络请求和异步 host I/O；需要 HTTP 检查时使用 HTTP DSL Runner。

该方案提供的是隔离的 JavaScript 语言子集，不是完整 Node.js 运行时。若后续确实需要原生 Node API、npm 模块或浏览器自动化，必须另行部署具备网络/文件/进程隔离能力的操作系统级沙箱，不能把这些能力直接暴露给当前 QuickJS guest。

## 4. 后端协议

RunnerClaimRequest 新增 runnerType，默认 HTTP，兼容旧 HTTP Runner。
- HTTP Runner 继续发送 runnerId；不传 runnerType 时按 HTTP 处理。
- Node Runner 发送 runnerId 和 runnerType=NODE。
- Mapper 按 runnerType 同时过滤 dpm_test_execution.runner_type 和 request_snapshot.scriptSnapshot.language。
- RunnerService 对领取、执行状态和租约校验允许 HTTP/NODE 两类固定脚本。
- 执行任务人工开始接口拒绝 HTTP/NODE，避免绕过独立 Runner。
- NODE 脚本第一阶段仅允许 INLINE 来源；FILE 和非法 entryPoint 在保存时拒绝。

本阶段不需要新增数据库表或 DDL。

## 5. 执行脚本示例

    function main(ctx) {
      console.log("Running case", ctx.case.caseNo);
      assert.equal(ctx.args.expectedStatus, "ACTIVE", "expected status");
      assert.exists(ctx.case.caseNo, "case number exists");
      return { caseNo: ctx.case.caseNo };
    }

## 6. 自动化测试结果

### 6.1 QuickJS WASM 测试

- 固定入口函数、上下文参数和断言：通过。
- process、require、fetch 不暴露：通过。
- eval/Function 动态构造仍局限于 QuickJS guest，不可访问宿主进程：通过。
- 断言失败返回 FAIL：通过。
- 无限循环按截止时间中断：通过。
- 无断言返回 BLOCKED：通过。
- 入口函数缺失返回 FAIL：通过。
- async 入口返回 BLOCKED：通过。
- 源码大小与 entryPoint 格式校验：通过。
- 输入快照递归冻结：通过。
- 断言数量超限返回 BLOCKED：通过。
- Guest heap 超限返回 BLOCKED：通过。

共 11 项 Node 单元测试通过。

### 6.2 Java 测试

- ExecutionTaskServiceTest：8 项通过，覆盖 ChatGPT 队列快照、并发认领后的候选过滤、队列 limit 上限，以及恢复扫描竞态。
- RunnerServiceTest：5 项通过，覆盖 NODE/HTTP 类型筛选、旧客户端默认 HTTP、非法类型拒绝、NODE 租约心跳和共享 Token 校验。
- TestScriptServiceTest：8 项通过，包含 NODE INLINE、FILE 拒绝、entryPoint 格式校验，以及 UTF-8 字节数超过 100 KiB 时拒绝保存。

本轮指定 Java 测试共 21 项通过，Maven BUILD SUCCESS。

### 6.3 依赖与启动脚本

- npm audit --omit=dev：0 vulnerabilities。
- start-node-runner.ps1、stop-node-runner.ps1：PowerShell AST 语法解析通过。
- Node Runner 已实际启动，并完成本地 API 端到端验证：一个轮次包含 PASS/FAIL 两个用例，Runner 分别领取并执行，4 条断言/用例逐条回传，父任务最终 COMPLETED，统计为 2/2 完成、1 PASS、1 FAIL、0 BLOCKED。
- HTTP Runner 向 claim 接口只发送 runnerId、不发送 runnerType；重新打包后完成兼容性回归，后端按默认 HTTP 领取，HTTP 用例 PASS。

### 6.4 ChatGPT 队列与人工介入端到端验证

- 新增 `GET /api/execution-tasks/claimable/chatgpt?limit=10`，仅发现 RUNNING 轮次、非 PROD 环境、PENDING 任务和 QUEUED/CHATGPT/AI 执行记录；实际认领由 start 接口原子完成。
- 队列返回 task、execution 和解析后的 `execution.requestSnapshot`，包含 AI 指令、用例步骤、测试数据、环境快照及代码版本，不包含明文凭据。
- 本节的 ChatGPT 侧流程由 `scripts/test-execution-e2e.ps1` 通过本地 PowerShell E2E 客户端模拟，不是应用内的自主模型 worker。
- 自动执行用例通过本地 `/api/health` 验证 HTTP 200 和 status=UP，PASS。
- 人工介入用例先进入 WAITING_HUMAN；模拟测试操作员确认后回到 PENDING/QUEUED，重新进入 ChatGPT 队列；同一 attempt 继续执行并 PASS。
- 父任务最终 COMPLETED，2/2 用例完成、2 PASS、0 FAIL、0 BLOCKED；所有轮次用例进入 COMPLETED/CANCELLED 终态后，测试轮次自动变为 COMPLETED。
- 最新完整 E2E 脚本验证 Node Runner 1 PASS/1 FAIL、执行证据附件上传/下载、ChatGPT 协议 2 PASS、并发开始和轮次自动完成，脚本退出码为 0。

## 7. 下一步

1. Node Runner、HTTP Runner、ChatGPT 队列/人工介入、并发状态保护和证据附件上传/下载均已完成本地可重复验证；ChatGPT 侧由 E2E 客户端模拟调用。
2. 测试报告生成/导出仍待实现，需复用轮次、用例和执行快照及已归档证据。
3. Python/Java Runner 需先确定可靠的操作系统级隔离边界；完整 Node.js 原生 API 不得直接暴露给 QuickJS guest。
