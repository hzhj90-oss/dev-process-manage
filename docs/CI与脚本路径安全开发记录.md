# CI 与脚本路径安全开发记录

> 日期：2026-11-11
> 项目目录：`D:\code\dev-process-manager`
> 当前状态：已写入本地代码，GitHub Actions 尚未在远程 Git 仓库执行。

## 1. CI 验证配置

新增 `.github/workflows/verify.yml`，在 GitHub Actions 的 Ubuntu 24.04 环境下运行：

1. 使用独立 MySQL 5.7 服务，仅设置测试专用数据库、用户和口令。
2. 安装 Java 8（Temurin）、Node.js 22，缓存 Maven/npm 依赖。
3. 执行前端 `npm ci`、Element Plus 导入检查和 Vite 生产构建。
4. 执行 `mvn -B -ntp -f backend/pom.xml clean verify`。
5. 以 `DPM_IT_MYSQL_URL/USERNAME/PASSWORD` 在测试数据库运行 `RunnerLeaseMySqlIT`。
6. 执行 HTTP Runner 7 项测试和 QuickJS Node Runner 11 项测试。

MySQL 测试类创建随机前缀的隔离表，测试结束会删除；不会运行项目业务数据库迁移。工作流只配置只读仓库权限，不使用本地 `.local` 中的任何凭据。

本地目录没有 `.git`，故不能触发在线 workflow；本次并未创建 Git 仓库、远程推送或宣称 CI 已在 GitHub 成功运行。

## 2. 测试脚本的 FILE 路径保护

新增 `backend/src/main/java/com/devprocess/manager/testscript/service/ScriptPathPolicy.java`，并接入 `TestScriptService.normalize`。

- 登记时统一 Windows 反斜线为 `/`，同时拒绝绝对路径、盘符、UNC、`.`/`..`、空目录段、编码分隔符、控制字符、Windows 设备名、冒号（NTFS ADS）以及过长路径。
- `resolveExistingReadOnlyFile(root, path)` 为未来受控 FILE 读取准备：必须存在的真实目录根、普通文件、逐层禁止符号链接、检查规范化真实路径是否仍在根目录内。
- 新增 `ScriptPathPolicyTest` 4 项（包含 Windows 上可能因符号链接权限被跳过的 1 项）；`TestScriptServiceTest` 增加真实登记接口所使用的规范化单测。

**边界说明：** 注册路径校验和 `resolveExistingReadOnlyFile` 不是安全沙箱。它不能单独消除 TOCTOU 并发替换、硬链接、恶意宿主进程、网络和环境变量访问等风险，绝不能据此直接开放 Python/Java/任意 FILE 执行。当前 Runner claim API 仍严格限制在 HTTP、NODE，且要求 INLINE 来源。

## 3. 本地验证

- `scripts/test-mysql-integration.ps1` 现支持已有完整的 `DPM_IT_MYSQL_*` 环境变量（CI 场景），缺失时回退本地 `.local/application-local.yml`；脚本不会删除调用者原有的环境变量。
- 本地 `RunnerLeaseMySqlIT`：5/5 通过。
- HTTP Runner DSL：7/7 通过；Node QuickJS：11/11 通过。
- `ScriptPathPolicyTest` + `TestScriptServiceTest`：13 项，12 通过、1 项符号链接测试因当前 Windows 平台权限未满足而跳过；无失败。Linux CI 允许符号链接时将覆盖对应测试。

## 4. 最终集成回归

- 完整 `scripts/start.ps1`：前端 1489 模块构建成功；Maven `clean verify` 编译 Java 77 个源文件，执行 46 项单测，其中 45 通过、1 项因 Windows 符号链接权限跳过，0 失败/错误。
- 新增 `scripts/verify-local.ps1`：一键运行前端导入检查、HTTP Runner 7 项、Node Runner 11 项、Java 46 项；加 `-IncludeMySql` 会额外执行隔离 MySQL 集成测试 5 项。**已经实际执行此命令，结果成功。**
- 真实 HTTP 验证：后端 `/api/health` 返回 UP；轮次 37 的 HTML 测试报告 HTTP 200，含一个证据文件链接。
- 对 `POST /api/test-scripts` 发起无副作用的非法 FILE 路径请求（`../outside.py`）：HTTP 400，正常拒绝。
- `scripts/test-frontend-smoke.ps1`：9/9 路由成功渲染，未发现未解析 Element Plus 标签及脚本错误。
- 本轮没有数据库 DDL、没有删除历史业务数据；本地后端重启后 PID 为 `7588`，HTTP/Node Runner 分别保持 PID `29376` / `5492`。

## 5. 剩余安全工作

1. 将代码放入授权的 Git 仓库并由 GitHub Actions 实际执行新工作流；若 CI 的 Linux MySQL 5.7 容器有平台差异，按 CI 日志修正。
2. 文件路径检查**不等于**执行安全。选定可验证的容器/虚拟机/隔离账号机制后，再设计 Python/Java FILE Runner 的低权限执行、资源限制、网络出站策略、凭据隔离与抗 TOCTOU 文件打开。
3. 浏览器 Runner 需要隔离浏览器配置目录、限制访问目标及处理跨域/凭据/下载风险，再开放给任务队列。
4. 前端 npm 依赖审计尚未完成；本机 PATH 只有 Node.js 可执行程序，没有独立 npm 命令，不能把尚未执行的审计标记为通过。
