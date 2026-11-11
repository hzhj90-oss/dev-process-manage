# Browser Runner 第一阶段开发记录

> 日期：2026-11-11
> 位置：`D:\code\dev-process-manager`
> 阶段结论：Browser Runner v1 核心、任务协议与真实 Chrome 测试已跑通；尚不等同于具备操作系统级隔离的生产执行环境。

## 已实现

- 新建 `runner/browser-runner`，使用 `playwright-core@1.65.0` 驱动 T14s 本地安装的 Google Chrome；不下载额外浏览器。
- 脚本统一使用 `BROWSER` + `INLINE` + JSON DSL；后端在保存时使用 `BrowserDslPolicy` 校验，Runner 在执行前再次严格校验。
- 支持 9 种指令：`GOTO`、`CLICK`、`FILL`、`PRESS`、`WAIT_VISIBLE`、`ASSERT_VISIBLE`、`ASSERT_TEXT`、`ASSERT_TITLE`、`SCREENSHOT`。
- Runner 可从既有 `/api/runner/claim` 领取任务，使用租约心跳、执行事件、断言事件、完成/失败接口，并将 PNG 截图作为执行证据附件上传；沿用原任务号、执行号和报告链路。
- 前端脚本库可选择 `BROWSER`，不允许 `FILE` 源；后端执行类型识别和领取 DTO 已支持 `BROWSER`。
- 新增 `scripts/start-browser-runner.ps1` 和 `stop-browser-runner.ps1`。三套 Runner（HTTP、Node、Browser）可独立启动停止。

## DSL 示例（测试报告筛选，不写数据库）

```json
{
  "version": 1,
  "timeoutMs": 30000,
  "steps": [
    { "action": "GOTO", "path": "/#/test-reports" },
    { "action": "ASSERT_VISIBLE", "selector": "h1" },
    { "action": "ASSERT_TEXT", "selector": "h1", "expected": "测试报告" },
    { "action": "FILL", "selector": ".filter-keyword input", "value": "browser-test-no-match" },
    { "action": "PRESS", "selector": ".filter-keyword input", "key": "Enter" },
    { "action": "ASSERT_VISIBLE", "selector": ".el-table__empty-block" },
    { "action": "SCREENSHOT", "name": "report-filter.png" }
  ]
}
```

## 安全边界与限制

- 仅允许**管理员信任的非生产环境**。环境类型 `PROD` 禁止，v1 仅支持 `authType=NONE`。登录页面的自动输入属于后续的凭据安全专项，不能将真实密码直接写进明文 DSL。
- 运行管理员通过环境变量 `DPM_BROWSER_ALLOWED_ORIGINS` 配置允许的站点 origin（逗号分隔）；默认仅为 `http://127.0.0.1:18090`。仅通过修改测试环境的 `baseUrl` 无法扩大网络目标。
- 页面每次使用独立浏览器上下文；仅放行目标 origin 的 HTTP(S) 资源，阻止其他 origin 请求、WebSocket、popup、service worker、下载和浏览器额外权限。
- 限制脚本 32KB、1–30 步、至少一个断言、截图最多 3 张、单张截图不超过 5MB、最长执行时间 60 秒、受限按键集合、有限 CSS 选择器长度。拒绝脚本内任意 JavaScript、命令执行、文件路径和跨站导航。
- 不在日志或任务事件中存储 `FILL` 的值，事件不回写原始选择器；截图依然可能包含敏感页面内容，使用者应避免测试真实敏感信息。
- **Playwright 浏览器上下文不是 OS 沙箱。** 现阶段不承诺可以安全执行任意不可信网页、任意脚本；严格授权测试环境并继续完善系统级隔离与网络/文件保护。该 Runner 不适合接入生产系统。

## 测试情况

- `browser-dsl.test.mjs`：8/8，涵盖非法路径、未知操作、代码注入、按键、截图名、无断言等。
- `browser-engine.test.mjs`：4/4，涵盖生产环境禁用、鉴权类型限制、origin 白名单和 Chrome 可执行文件检查。
- Chrome 真实页面冒烟：在本地测试报告页打开页面、输入筛选、按 Enter、断言空列表、点击重置、断言列表恢复、生成截图；12 步/4 个断言/1 张 PNG，均成功。
- 任务协议联调（模拟管理服务、真实 Chrome）：领取、心跳、事件、PNG 上传和 PASS 回写全部成功；该联调未增删真实数据库数据。
- Java 新增 5 个 Browser DSL 测试；全量 Maven 51 项、0 失败、1 项 Windows 符号链接权限跳过。
- 真正后端的 `POST /api/test-scripts` 对跨域脚本返回 HTTP 400；`POST /api/runner/claim` 可识别 BROWSER，当前没有待领取任务。
- 前端构建、10 路由冒烟、MySQL 集成、HTTP/Node Runner 及 npm 审计已纳入原有回归体系；新增 Browser Runner 的 12 项策略测试与可选真机集成验证。

## 使用与下一步

在 T14s 上先运行应用，再运行浏览器执行器：

```powershell
cd D:\code\dev-process-manager
.\scripts\start.ps1
.\scripts\start-browser-runner.ps1
.\scripts\test-browser-integration.ps1
# 或执行统一回归
.\scripts\verify-local.ps1 -AuditDependencies -IncludeMySql -BrowserIntegration
```

Browser Runner 初始仅允许页面 `http://127.0.0.1:18090`。为其他明确授权的测试环境扩展 allowlist，需要在启动 Runner 的进程环境中设置 `DPM_BROWSER_ALLOWED_ORIGINS`，且脚本类型必须匹配。

剩余工作：对真实数据库中**专用测试轮次**进行端到端用例验收、截图附件在报告中的页面化核对、可靠中断/租约失效处理、凭据安全注入和 OS 级隔离评估。旧 Python/Java FILE 脚本执行仍然关闭。CI workflow 已加入 Browser 单测和 npm 安全审计，但尚未在远端仓库运行。

- 追加：脚本编辑窗口的 Browser / Playwright 语言选项通过真实 Chrome 测试；Runner 再次检查任务与环境快照中任意一方是否为 PROD，均禁止执行。

## 2026-11-11：GitHub 初始化及 Browser Runner 真实数据库验收

- 新 GitHub 仓库：`https://github.com/hzhj90-oss/dev-process-manage`，`main` 分支已收录初始 194 份源码、文档和脚本。
- GitHub 首次提交：`17f75a5e3408e3c1f5c5fd33959fe267e9473c30`；本地 `main` 已关联 `origin/main`，保留 `backup/initial-local-snapshot`。同步不包含 `.local/`、`data/`、`logs/`、构建产物和依赖缓存。
- 首次 GitHub Actions Verify：`https://github.com/hzhj90-oss/dev-process-manage/actions/runs/42956112135`，结果 **success**，已在远端实测 Java/前端/Runner/MySQL 集成流程。
- Browser Runner **真实数据库**（非 mock）执行结果：PASS 轮次 `42`、任务 `109`、执行 `73`，截图附件 `3`；有意断言失败轮次 `43`、任务 `110`、截图附件 `4`，执行结果正确归类为 FAIL。
- 浏览器执行器增强：断言缺失元素、断言文本元素不可用时归类 `ASSERTION_FAILED`；任意运行错误在租约未失效且页面仍可用时尝试自动保存 `browser-failure.png`，截图失败也不会覆盖原始错误；Runner 对断言失败额外写入 `ASSERTION_FAILED` 事件。
- 新增 `runner/browser-runner/browser-failure-smoke.mjs` 与 `browser-protocol-failure.test.mjs`，分别验证失败截图和模拟管理接口的 FAIL/附件/事件全链路；纳入 `scripts/test-browser-integration.ps1`。
- 新增可重复的**真实数据库**自检程序 `scripts/test-browser-real-db.mjs`。默认拒绝写入，必须显式设置 `DPM_BROWSER_E2E_ALLOW_WRITE=YES` 和 `DPM_BROWSER_E2E_VERSION_ID=<验证版本ID>`。只允许项目编号以 `DPM-VERIFY-` 开头的验证项目，且只连接 `127.0.0.1:18090` 的 TEST、NONE 环境；每次测试新增独立轮次，不清理历史记录。
- 新脚本再次验证：PASS 轮次 `44` / 任务 `111`、FAIL 轮次 `45` / 任务 `112`，两者均完整验证 PNG 下载与 HTML 报告链接；失败轮次同时核对 `ASSERTION_FAILED` 事件。
- **注意**：Browser Runner 仍不是 OS 沙箱，仅允许明确授权的非生产站点，不能执行任意不可信网页。Python/Java Runner 仍未开放。

### Browser Runner 真实数据库验收（仅本机测试环境、显式写入）

```powershell
cd D:\code\dev-process-manager
$env:DPM_BROWSER_E2E_VERSION_ID = '4'  # 仅示例，本机 DPM-VERIFY 验证版本
$env:DPM_BROWSER_E2E_ALLOW_WRITE = 'YES'
node .\scripts\test-browser-real-db.mjs
```

每次运行会新建两个测试轮次：一个预期 PASS，一个有意预期 FAIL；自动检查截图附件、附件下载、HTML 报告和失败事件。先确保后端和 Browser Runner 已启动。不要在生产环境运行。
