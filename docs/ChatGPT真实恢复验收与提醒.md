# ChatGPT 真实恢复验收与异常提醒

> 2026-11-11，第十五批。T14s 本地验证；保持不登录、不提交、不推送 Git 的项目约定。

## 本次新增

- `scripts/test-ai-recovery-real-db.mjs`：专用版本下创建只读健康检查 AI 用例与新轮次，启动任务、记录检查点、模拟超时，观察 Spring 定时恢复，显式调用人工恢复接口，验证新 attempt 继承检查点，然后 GET 本机健康接口并完成 PASS。
- `scripts/expire-ai-verification-task.ps1`：只对 `DPM-VERIFY-` 项目、`AI Recovery E2E ` 轮次、`TC-AI-RECOVERY-E2E-` 用例、TEST/NONE 环境和指定 RUNNING/CHATGPT 执行记录，更新一行数据库的心跳时间；本地数据库连接严格固定 127.0.0.1:3306，凭据仅从 .local 读取，不输出。
- 两个脚本默认拒绝写入，运行测试必须显式设置 `DPM_AI_RECOVERY_E2E_ALLOW_WRITE=YES` 和 `DPM_AI_RECOVERY_E2E_VERSION_ID=4`；版本还需要经 API 核对项目编号前缀 `DPM-VERIFY-`。
- `frontend/src/utils/aiAttention.js`、单测：运行心跳距当前 4/5 分钟提醒，人工等待超过 15 分钟提醒，待恢复时显示人工操作指引。
- ChatGPT 执行台「任务状态追踪」新增告警显示，不执行恢复、不触发写请求。Browser 冒烟测试新增心跳超时提示验证。

## 实际验收（真实本地数据库）

- 使用版本 4（DPM-VERIFY-20261108），专用 TEST/NONE 环境。
- 新轮次 46；任务 113；原 attempt executionId 77。
- 已成功写入检查点；本地数据库定向将这一任务心跳回拨六分钟，原有 60 秒恢复扫描确实使任务进入 `RECOVERY_REQUIRED`，原执行进入 `INTERRUPTED` 并写入中断事件。
- 对旧执行再提交完成请求被正确拒绝。
- 验证脚本**显式**调用人工恢复 API（并非真实点击 UI），产生新执行 executionId 78；断言 attemptNo+1、检查点与不可变快照继承、历史中断记录保留。
- 新执行开始后从检查点核对，实际请求 `GET http://127.0.0.1:18090/api/health` 得到 HTTP 200、UP；写入通过事件，结果为 `COMPLETED / PASS`，测试报告 HTTP 200。
- 测试未修改旧任务 29，也没有操作已有的 7 条待执行 AI 队列；真实数据仅增加专用验证记录，不清理历史数据。

## 最终回归

- `scripts/test-frontend-smoke.ps1`：11/11 页面通过。
- `scripts/verify-local.ps1 -AuditDependencies -IncludeMySql -BrowserIntegration`：Java 55（54 通过、1 Windows symlink 跳过）、MySQL 5/5、HTTP 7/7、Node 11/11、Browser 策略 12/12、ChatGPT 18/18、Chrome 续执行和警告验证通过。
- npm frontend / node / browser 审计均 0 已知漏洞。后端重新部署至 127.0.0.1:18090。

## 注意及下一步

- 真实 E2E 是受控的验证任务，**不能**将此机制用于真实业务任务自动快进心跳。
- 自动恢复不会直接重做脚本；对有副作用的步骤，仍应由人工确认外部状态。
- 后续优先补自动化任务审计/恢复 UX；若扩展 Python、Java 任意脚本，必须先验证 OS 级隔离；备份仍需异库恢复演练。
