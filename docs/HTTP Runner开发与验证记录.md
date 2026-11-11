# HTTP Runner 开发与验证记录

更新日期：2026-11-10

## 1. 本阶段目标

在不执行任意用户脚本源码的前提下，打通固定脚本的第一种自动化执行方式：受限 HTTP DSL。

架构遵循既有执行任务设计：Runner 独立于 Spring Boot Web 服务运行，通过本机 HTTP API 轮询领取任务；Web 服务不直接执行用户脚本，也不开放 Runner 入站端口。

本阶段仅实现 HTTP DSL Runner，不代表 NODE、PYTHON、JAVA 通用脚本执行器已经完成。

## 2. 代码组成

### 2.1 管理平台后端

- execution/controller/RunnerController.java：Runner 协议入口。
- execution/service/RunnerService.java：共享密钥认证、领取、租约、心跳、事件、完成和失败处理。
- execution/mapper/ExecutionTaskMapper.java：领取和租约 Mapper 方法。
- resources/mapper/execution/ExecutionTaskMapper.xml：候选任务筛选、租约更新和过期恢复 SQL。
- resources/application.yml：Runner Token、租约时间和批量领取配置。
- testscript/service/TestScriptService.java：HTTP DSL 入库校验，禁止脚本自带敏感认证 Header/Query。

### 2.2 独立 Runner

- runner/http-runner/runner.mjs：轮询、领取、请求执行、心跳、事件和结果上报。
- runner/http-runner/http-dsl.mjs：DSL 校验、目标 URL 构造、JSON 路径解析及断言。
- runner/http-runner/http-dsl.test.mjs：DSL 单元测试。
- runner/http-runner/README.md：运行方式、DSL 格式和协议说明。

### 2.3 本地启动脚本

- scripts/start.ps1：创建本机随机 Runner Token（仅保存在 Git 忽略的 .local 目录），并将 Token 通过进程环境变量交给 Spring Boot。
- scripts/start-http-runner.ps1：检查应用健康状态并启动独立 Node Runner。
- scripts/stop-http-runner.ps1：只停止 Runner PID 文件指向且命令行确认为 runner.mjs 的进程。

## 3. 执行流程

1. 用户创建 HTTP 类型脚本，脚本保存受限 JSON DSL，不保存可执行 JS 源码。
2. 测试用例选择 SCRIPT 模式并关联已启用脚本。
3. 测试轮次创建时固化用例修订、脚本修订和环境快照。
4. 测试轮次开始后，用户创建整轮或单用例执行任务。
5. ExecutionTaskService 创建 QUEUED execution，runner_type 根据脚本语言固定为 HTTP。
6. 独立 Runner 使用共享 Token 调用 /api/runner/claim。
7. 服务端在事务内按父任务优先、子任务随后锁定任务，重新校验 PENDING/QUEUED 状态，生成随机租约令牌并只保存 SHA-256 摘要。
8. Runner 使用环境快照中的 API/WEB base URL 构造请求，不允许 DSL 指定目标主机。
9. Runner 上报 API_REQUEST、API_RESPONSE、ASSERTION_PASSED/FAILED 等事件。
10. Runner 调用 complete 提交 PASS、FAIL 或 BLOCKED；服务端更新 task、execution、cycle_case，并重新聚合父任务状态。
11. Runner 异常调用 fail，task 标记 FAILED；Runner 意外退出则等待租约过期，由既有恢复扫描器标记 RECOVERY_REQUIRED。
12. 恢复必须由用户显式触发，不能自动重放可能产生副作用的请求。

## 4. Runner API

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | /api/runner/claim | 使用 X-DPM-Runner-Token 领取任务 |
| POST | /api/runner/tasks/{taskId}/heartbeat | 使用 Runner ID 和租约 Token 续租 |
| POST | /api/runner/tasks/{taskId}/events | 上报请求、响应和断言事件 |
| POST | /api/runner/tasks/{taskId}/complete | 提交最终结果 |
| POST | /api/runner/tasks/{taskId}/fail | 报告 Runner 引擎自身异常 |

领取响应只向 Runner 返回一次明文 leaseToken；数据库不存明文。后续请求同时校验 Runner ID、Token 哈希和租约有效期。共享 Token 比较使用 MessageDigest.isEqual。

## 5. HTTP DSL 第一阶段边界

- 方法：GET、HEAD、OPTIONS。
- 不允许 Request Body。
- base 仅允许 API、WEB；目标主机来自测试轮次环境快照。
- path 是相对于所选 base URL path 的相对路径。例如 apiBaseUrl 为 http://127.0.0.1:18090/api，path=/health，最终请求 /api/health。
- 禁止绝对 URL、协议相对 URL、路径穿越、编码分隔符和 URL 重定向跟随。
- 禁止敏感认证 Header/Query 名称；不允许在脚本中保存 API Key、Token、Cookie、密码或凭据引用值。
- 认证方式第一阶段只允许 NONE；其他 authType 返回 BLOCKED，等待后续接入安全凭据解析器。
- 超时 1–30 秒；响应体最多读取 100 KiB，超限结果为 BLOCKED。
- 断言：STATUS_EQUALS、HEADER_EQUALS、JSON_PATH_EQUALS、JSON_PATH_EXISTS、BODY_CONTAINS。
- JSON 路径只支持普通对象属性和数字数组下标，不支持过滤、递归、脚本表达式。

## 6. 验证结果

### 6.1 自动化测试

- Node HTTP DSL：7/7 通过。
- Java ExecutionTaskServiceTest：6/6 通过。
- Java TestScriptServiceTest：6/6 通过，包含敏感自定义 Header/Query 拒绝。
- PowerShell 启停脚本语法解析：3/3 通过（start.ps1 后续重写后需再次复核）。
- 完整 scripts/build.ps1：Vite production build 成功；Maven clean verify 成功；后端 71 个源文件编译；12 项 Java 测试全部通过。

### 6.2 真实端到端验证

验证环境：临时项目 DPM-VERIFY，版本 DPM-VERIFY-20261108-V1，环境 DPM_VERIFY；应用只监听 127.0.0.1:18090，Runner 在同一台电脑独立运行。未访问外部业务系统。

第一次验证：
- 脚本 ID 1、用例 ID 6、轮次 ID 5、父任务 ID 7。
- Runner 成功领取任务并实际发送 HTTP 请求。
- 因 DSL path 写成 /api/health，而 apiBaseUrl 已经包含 /api，最终请求重复了 /api，得到 HTTP 404。
- 两项断言正确记录 FAIL；父任务、子任务均正确转为 COMPLETED。

修正脚本为相对于 API base URL 的 /health 后，第二次验证：
- 脚本 ID 1（新修订）、用例 ID 7、轮次 ID 6、父任务 ID 9。
- HTTP 响应 200。
- STATUS_EQUALS 200 通过。
- JSON_PATH_EQUALS $.status = UP 通过。
- execution.result = PASS。
- 子任务 COMPLETED，父任务 COMPLETED。
- execution 事件数 7，包含任务创建、Runner 领取、请求、响应、两条断言通过和执行完成。

安全验证：
- 不提供 X-DPM-Runner-Token 的 claim 请求返回 HTTP 401。
- Runner 运行时未向本机开放入站监听端口。
- 任务完成后租约字段按 SQL 清理；数据库不保存明文租约 Token。

## 7. 当前运行状态

- Spring Boot 应用由 scripts/start.ps1 启动。
- 独立 HTTP Runner 由 scripts/start-http-runner.ps1 启动。
- Runner PID 记录在 logs/http-runner.pid；日志写入 logs/http-runner.stdout.log 和 logs/http-runner.stderr.log。
- .local/runner-token.txt 为本机私有配置，必须保持 Git 忽略，不得提交或复制到仓库外。

## 8. 尚未完成

1. HTTP Basic/Bearer 等认证的安全凭据解析器；在此完成前不允许把认证值写入 DSL。
2. HTTP 写请求、请求体和可配置写操作审批；当前只读方法。
3. NODE、PYTHON、JAVA 独立 Runner 及隔离沙箱。
4. ChatGPT 动态执行编排、步骤级续接及工具权限控制。
5. 浏览器自动化、自动截图及请求/响应证据自动采集（执行证据附件的手动上传/下载已实现）。
6. 测试报告生成/导出、统计和 Runner 状态监控 UI。
7. 对 HTTP Runner 的租约过期、取消竞态、超大响应和多 Runner 并发补充专门集成测试。

## 9. 注意事项

- 不要把本阶段 HTTP Runner 描述为任意 Node.js 脚本执行器。
- 不要在 Spring Boot 进程中使用 ProcessBuilder 执行脚本库源码。
- 不要绕过租约校验直接更新执行结果。
- 不要将 .local/runner-token.txt、数据库密码或任何认证信息提交 Git。
- 端到端验证数据保留在临时验证项目中，便于回看失败与成功事件链。
