# Dev Process Manager

Software development lifecycle management: projects, versions, requirements, designs, test cases, script definitions, environments, test cycles and execution tasks.

## Technology

- Backend: Java 8, Spring Boot 2.7.18, MyBatis, MySQL 5.7.44
- Frontend: Vue 3, Vite, Element Plus
- Runtime: one Spring Boot process serves REST APIs and the built frontend
- Local entry: http://127.0.0.1:18090

## Directory layout

- frontend: Vue application source
- backend: Spring Boot application and packaged frontend assets
- database/migrations: versioned MySQL DDL
- docs: architecture, database design and module development records
- scripts: local build/start/stop helpers
- .local: ignored local credentials; never share or commit this directory
- data: local uploaded files and execution attachments; ignored
- logs: local application logs; ignored

## Single-port runtime

Build the Vue frontend into backend/src/main/resources/static.
Spring Boot serves the UI and /api endpoints on port 18090. The normal startup script does not launch the Vite development server or expose a second port. Start fixed-script workers separately with scripts/start-http-runner.ps1 and scripts/start-node-runner.ps1; stop them with the matching stop scripts.
The default listener is 127.0.0.1; LAN access and firewall rules are not enabled.

## Database

- Database: dev_process_manager
- Host/port: 127.0.0.1:3306
- Applied schema version: 1.3.0
- Current table count: 18
- Applied migrations: V1.0.0, V1.1.0, V1.2.0, V1.3.0
- A verified pre-migration backup is stored under data/backup.
- Initial schema: database/migrations/V1.0.0__initial_schema.sql

Read docs/database/数据库设计.md before changing schema. Back up the local database before applying migrations.

## Local startup

- Start: run scripts/start.ps1 (or scripts/start.cmd); the script validates Element Plus imports, builds the frontend/backend and starts the JAR. Process-only recovery can use `scripts/start.ps1 -SkipBuild` to start the last verified JAR without rebuilding.
- UI smoke test: run scripts/test-frontend-smoke.ps1 while the application is running; it checks eleven routes in an isolated headless Chrome/Edge profile and cleans up its temporary files.
- Local regression: run scripts/verify-local.ps1 for import checks, HTTP/Node/Browser Runner suites and Java unit tests; add `-IncludeMySql` for MySQL 5.7 integration tests, `-AuditDependencies` for online npm security checks and `-BrowserIntegration` for opt-in Chrome/browser protocol tests.
- Browser Runner: after starting the backend, use scripts/start-browser-runner.ps1 and scripts/stop-browser-runner.ps1; v1 is restricted to admin-approved non-production origins and needs locally installed Chrome.
- Stop: run scripts/stop.ps1 (or scripts/stop.cmd).
- Local DB credentials are loaded from .local/application-local.yml.
- Logs: logs/application.stdout.log and logs/application.stderr.log.
- Automated local backup: `scripts/backup-database.ps1` backs up MySQL 5.7 plus `data/uploads`, verifies GZip/ZIP/SHA-256 before publishing and retains 30 days (minimum 7 backups). T14s has the `DPM-DevProcessManager-DatabaseBackup` Windows scheduled task (daily 02:30 local time and logon catch-up); use `scripts/backup-status.ps1 -Verify` to inspect freshness and integrity. See `docs/数据库自动备份与恢复验证.md`. An isolated, disposable MySQL 5.7 restore E2E is implemented and verified; see docs/数据库隔离还原验收.md.
- Windows service watchdog (optional local operation): the scheduled task `DPM-DevProcessManager-Watchdog` is installed on T14s for current-user logon and minute checks. `scripts/service-status.ps1` shows task/process health; `scripts/watchdog-maintenance.ps1 -Action pause|resume` controls maintenance; `scripts/install-service-watchdog.ps1` and `scripts/uninstall-service-watchdog.ps1` manage only this scheduled task. Explicit stop scripts prevent automatic restart until the matching service is explicitly started. See `docs/本地服务守护与自动恢复.md`. This watchdog never retries test cases.

## Implemented modules

- Project management: list, detail, create and edit.
- Version management: list, detail, create and edit.
- Requirement management: version-scoped list, detail, create and edit.
- Requirement design: append-only design revision history.
- Test case management: steps, requirement coverage, execution mode and immutable case revisions.
- Automation script library: create/edit, enable/disable and immutable script revisions; HTTP DSL, NODE QuickJS WASM and BROWSER Playwright JSON DSL. Python/Java FILE paths are registered with strict portable path validation, but execution remains disabled until an OS sandbox exists.
- Environment management: environment URLs, auth type, credential reference and non-sensitive JSON configuration.
- Test cycle management: version-scoped cycles, environment/code baseline, immutable case/requirement/design/environment snapshots, start/abort, automatic completion after all cases reach terminal states, and live result statistics.
- Execution task management: parent/child tasks, single-case execution, idempotent creation, attempt history, state transitions, event/checkpoint recording, manual intervention, cancellation, recovery and evidence attachment APIs.
- Execution task UI: task list, progress/result counts, attempt/event detail, manual result entry, human-intervention actions, evidence attachment upload and download.
- Result consistency: creating a fresh execution for a previously completed case resets the current cycle-case result to NOT_RUN while preserving older attempts in execution history. A GET-only audit script (scripts/audit-cycle-results.mjs) compares all cycle/case/report totals and runs in browser-integration regression. The test-cycle page has a **read-only status diagnosis** button, which classifies RUNNING cycles with all terminal cases by active/root task counts. Historical cycle-state warnings are reported, not silently rewritten; see docs/测试轮次历史状态诊断验收.md.
- Headless maintenance: the Windows watchdog and scheduled-backup tasks now use GUI-subsystem wscript.exe wrappers to run hidden PowerShell without opening a console; the scheduled-task status scripts report whether windowless launch is actually configured. Details: docs/第二十七批-任务报告重试与无窗口计划任务.md.
- Core configuration safety: project, version and environment forms now lock immediately during async validation/submission, preventing double-create/double-update and accidental modal close; version edits retain the label of an inactive owning project and retry incomplete project options. Environment list rejects stale active/inactive toggles and shows persistent error/retry. Two GET-only/mocked-write Chrome suites cover create/edit, retry, old responses, JSON validation and zero real writes. See docs/第三十四批-项目版本环境配置全流程验收.md.
- Requirement design/script list safety: detailed-design modals reject outdated A→B responses after close/reopen, show persistent retryable errors, and bind new revisions to the originally selected requirement. Script-library list ignores stale searches/pages and offers persistent error/retry. GET-only Chrome verifies both, plus one browser-intercepted design POST (0 real writes). See docs/第三十三批-详细设计与脚本列表异步稳定性验收.md.
- Script/cycle editing race safety: script edit and revision history and test-cycle edit now reject stale GET responses on close/reopen or item switch, expose retryable errors, and disable save until current detail loads. A GET-only Chrome test verifies late responses, retries and latest revision wins; see docs/第三十二批-脚本与轮次编辑异步竞态验收.md.
- Case editor/history race safety: closing or reopening a test-case editor invalidates all pending details/requirement/script reads; the form never accepts an old case after a newer selection, blocks saving until the active detail is ready, and offers a retry. Revision history likewise ignores stale case and revision results. Verified in a GET-only Chrome delayed-response regression (docs/第三十一批-用例编辑与修订历史异步安全验收.md).
- Test-case link options: requirement selector uses a new lightweight, bounded GET /api/test-cases/available-requirements/page (keeps the legacy GET endpoint compatible), while enabled-script choices reuse the existing paginated GET /api/test-scripts?enabled=true. Both use complete-page validation; failed/incomplete links block saving an edited case, with visible retry. Verified with 101 requirements/scripts in GET-only Chrome. See docs/第三十批-关联需求与脚本分页验收.md.
- Paginated select options: project, version and test-case choices on the version/requirement/case/cycle pages now fetch all pages (up to a bounded 5,000 rows), reject missing/duplicate/inconsistent results, and offer visible retry instead of silently hiding records beyond the first 100. Verified in Chrome using 101 mocked records with no database writes; see docs/第二十九批-下拉选项分页完整性验收.md.
- Cycle/AI async safety: test-cycle detail dialogs open with a loading state, ignore late responses after close/switch and offer a retry action. The ChatGPT queue and task tracker use generation guards so overlapping refreshes (including A→B→A ID switches) never replace the latest result; validated in GET-only Chrome. See docs/第二十八批-轮次详情与ChatGPT异步竞态验收.md.
- Report/task reliability: test report and execution task lists reject stale responses and offer persistent retry; report review and task details can retry read failures, and outdated task-detail responses are ignored. A dedicated GET-only Chrome test verifies both paths.
- List reliability: project, version, requirement, case and test-cycle screens accept only the latest list response. Older network responses/errors cannot overwrite a newer filter, and current load failures show a persistent retry action instead of stale records. Project edits keep their original record ID even if list pagination/filtering changes. Verified with deliberately reordered Chrome responses and a fully mocked edit request; see docs/第二十六批-列表乱序与重试验收.md.
- Context navigation: project rows offer **View versions**; version rows offer **View requirements / test cycles**. Destination lists automatically filter by the selected project/version and the create dialogs inherit it; route IDs are strictly validated. All links are read-only and covered by Chrome E2E and Node tests; see docs/第二十五批-业务上下文导航与验收.md.
- Task lifecycle integrity: manual/ChatGPT/HTTP/Node/Browser state transitions now verify the cycle-case SQL update affected exactly one row, otherwise fail the transaction instead of exposing a stale result. The read-only scripts/audit-task-hierarchy.mjs checks root/child aggregation and latest attempts across cycles during browser-integration regression. See docs/执行任务状态同步与父子任务一致性验收.md.
- Test reports: standalone sidebar report index with keyword/status filters and pagination; on-demand HTML reports based on immutable cycle/case/requirement/design/environment snapshots, execution attempts, events and evidence attachment links; inline view, HTML download and browser print/save-as-PDF. A separate read-only CSV download exports one sanitized row per case with execution counts and latest result. The report index now has a failure/blocked-case review dialog with a safe deep link to the exact execution task; the review API returns metadata only.
- Dashboard: six real API-based counters (projects, versions, environments, test cases, test cycles, execution tasks) with partial-load warnings and eight working module shortcuts; verified against real API totals in Chrome.
- Runner presence: `/api/runner/status` reports authenticated Runner-protocol activity for HTTP, Node and Browser workers (30-second offline threshold), with auto-refresh and offline warnings on the execution tasks page; no database migration or worker change required.
- ChatGPT execution workbench: `/#/ai-execution` lists claimable AI cases, generates copyable single-task execution instructions and polls the selected task's latest status/events every 10 seconds. The CLI adapter `scripts/chatgpt-task.mjs` supports queue/inspect/start/event/checkpoint/heartbeat/human/complete/status with stale-attempt checks and local-only HTTP. A real verification task (29/21) was completed as PASS with eight persisted events; it is not unattended model execution. See `docs/ChatGPT执行台开发记录.md` and `docs/ChatGPT动态执行工具与验收.md`.
- Scope decision (2026-11-11): **no system login or role/permission validation features are required**. Keep the application bound to localhost unless its network exposure is deliberately reconsidered.

Execution boundary: ChatGPT participates as the model in the ChatGPT conversation and uses the configured local Desktop Commander Tunnel to read task snapshots and call the execution APIs. The application itself does not call the OpenAI API or run an autonomous model worker. The ChatGPT queue/start/event/checkpoint/human-intervention protocol is implemented; the repeatable local E2E script simulates the ChatGPT-side API client for deterministic verification. Fixed HTTP, NODE and BROWSER Runners are implemented: HTTP runs a read-only DSL; NODE runs a restricted JavaScript subset in QuickJS WASM (not the full Node.js runtime, with no host process/filesystem/network APIs). Execution evidence attachments can be uploaded/downloaded using the existing attachment table. HTML test reports are generated from immutable cycle/case/requirement/design/environment snapshots and execution history, with sensitive-data redaction and attachment links. Python/Java Runners are not implemented. Browser Runner v1 supports a strict JSON step protocol on whitelisted non-production origins and does not provide OS-level isolation. V1.3.0 is applied to the local database; new installations must apply migrations in version order.

## Latest local verification (2026-11-11)

- MySQL V1.3.0 applied after a verified pre-migration backup; all 18 tables retained.
- Latest `scripts/start.ps1` run completed the Vite 6.4.6 production build (1701 modules) and Maven `clean verify`; 78 backend Java source files compiled and 51 tests ran (50 passed, 1 skipped due to Windows symlink privilege), with 0 failures/errors. The separate MySQL 5.7.44 integration suite again passed 5/5 tests. The report API against cycle 37 still returns HTTP 200 with its evidence attachment link. HTTP Runner 7/7 and Node Runner 11/11 tests passed.
- Node QuickJS WASM suite: 11/11 tests passed, covering host API absence (including eval/Function isolation), timeout, memory, input freezing, assertion limits and result mapping; npm audit reports 0 vulnerabilities.
- Java tests cover ChatGPT queue filtering/snapshot, idempotency validation, recovery-scan versus refreshed-heartbeat conditions, expired Runner lease rejection, Runner heartbeat/completion rejection after cancellation, and cycle-abort child preservation/cancellation. The MySQL integration test runs the actual `ExecutionTaskMapper.xml` against an isolated InnoDB table and verifies future/equal/expired lease boundaries plus heartbeat/recovery row-lock serialization.
- Real API smoke tests passed for idempotent creation, ChatGPT start, checkpoint/event de-duplication, human confirmation, completion, cancellation, recovery and parent/child aggregation.
- `scripts/test-execution-e2e.ps1` passed end to end: Node Runner returned 1 PASS/1 FAIL; evidence attachment upload/download returned byte-identical content and appeared in execution detail; ChatGPT returned 2 PASS including WAITING_HUMAN and same-attempt requeue/resume; concurrent ChatGPT start returned exactly one HTTP 200 and one HTTP 409; checkpoint JSON/event persistence and parent completion were verified.
- Completion-versus-cycle-abort concurrency returned a consistent terminal state. In the latest run completion won (HTTP 200), the cycle auto-completed and the later abort was rejected (HTTP 400); the E2E assertion also accepts the inverse valid outcome where abort wins and completion is rejected. A separate abort test cancelled pending/running children, removed them from the ChatGPT queue and rejected late start/completion requests.
- Test cycle auto-completion: after every case reaches COMPLETED or CANCELLED, the RUNNING cycle is automatically marked COMPLETED with completed_at. PENDING/RUNNING/WAITING_HUMAN/RECOVERY_REQUIRED cases block completion; ABORTED and empty cycles remain unchanged. Statistics include PASS/FAIL/BLOCKED/SKIPPED/NOT_RUN.
- Recovery scheduler verified: a test task with a six-minute-old heartbeat was moved to RECOVERY_REQUIRED/INTERRUPTED by the scheduled scan; explicit resume created a new attempt and carried its checkpoint forward.
- Runtime verified on the single local listener 127.0.0.1:18090; health, API and frontend entry all returned HTTP 200. Actual PIDs change after service restarts; use `scripts/service-status.ps1` to inspect currently active processes and the watchdog task instead of relying on recorded PIDs.
- Frontend lazy loading / Element Plus per-page imports: largest Vite JS chunk decreased from 1,095.09 KB to about 296.34 KB with the patched dependency versions; route-level HTML smoke test passed 10/10 pages and the component import checker passes. The old 500 KB Vite chunk warning is gone. Maven settings still contains a duplicate plugin repository ID.

## API endpoints

- GET/POST /api/projects
- GET/PUT /api/projects/{id}
- GET/POST /api/versions
- GET/PUT /api/versions/{id}
- GET/POST /api/requirements
- GET/PUT /api/requirements/{id}
- GET /api/requirements/{id}/designs
- GET /api/requirements/{id}/designs/{designId}
- POST /api/requirements/{id}/designs
- GET/POST /api/test-cases
- GET/PUT /api/test-cases/{id}
- GET /api/test-cases/{id}/revisions
- GET /api/test-cases/{id}/revisions/{revisionId}
- GET /api/test-cases/available-requirements
- GET /api/test-cases/scripts
- GET/POST /api/test-scripts
- GET/PUT /api/test-scripts/{id}
- PUT /api/test-scripts/{id}/enabled
- GET /api/test-scripts/{id}/revisions
- GET /api/test-scripts/{id}/revisions/{revisionId}
- GET/POST /api/environments
- GET/PUT /api/environments/{id}
- GET/POST /api/test-cycles
- GET/PUT /api/test-cycles/{id}
- POST /api/test-cycles/{id}/cases
- DELETE /api/test-cycles/{id}/cases/{cycleCaseId}
- POST /api/test-cycles/{id}/start
- POST /api/test-cycles/{id}/abort
- GET /api/test-cycles/{id}/report (HTML inline; append `?download=true` to download)
- GET /api/test-cycles/{id}/report.csv (UTF-8 CSV attachment; case results and execution metadata only)
- GET /api/test-cycles/{id}/report/review (no-store JSON; per-case results, attempt counts, and exact task IDs for read-only failure triage)
- GET /api/test-cycles/diagnostics?limit=100 (no-store, read-only metadata; classify RUNNING cycles whose captured cases are all terminal, max 200)
- POST /api/test-cycles/{cycleId}/execution-tasks
- POST /api/test-cycles/{cycleId}/cycle-cases/{cycleCaseId}/execution-tasks
- GET /api/execution-tasks
- GET /api/execution-tasks/{id}
- GET /api/execution-tasks/claimable/chatgpt?limit=10 (AI task discovery; start endpoint performs atomic claim)
- POST /api/execution-tasks/{id}/cancel
- POST /api/execution-tasks/{id}/resume
- POST /api/execution-tasks/{id}/human-intervention
- POST /api/execution-tasks/{id}/executions/{executionId}/start
- POST /api/execution-tasks/{id}/executions/{executionId}/events
- POST /api/execution-tasks/{id}/executions/{executionId}/complete
- POST /api/execution-tasks/{id}/executions/{executionId}/attachments (multipart evidence upload)
- GET /api/execution-tasks/{id}/executions/{executionId}/attachments/{attachmentId} (evidence download)
- POST /api/runner/claim (runnerType=HTTP, NODE or BROWSER; omitted defaults to HTTP)
- POST /api/runner/tasks/{taskId}/heartbeat
- POST /api/runner/tasks/{taskId}/events
- POST /api/runner/tasks/{taskId}/complete
- POST /api/runner/tasks/{taskId}/fail
- GET /api/health

## Development records

- docs/项目与版本管理开发记录.md
- docs/需求与详细设计模块开发记录.md
- docs/测试用例模块开发记录.md
- docs/自动化脚本库模块开发记录.md
- docs/HTTP Runner开发与验证记录.md
- docs/Node Runner开发与验证记录.md
- docs/Browser Runner第一阶段开发记录.md
- docs/Runner在线状态监控开发记录.md
- docs/Runner异常告警与安全恢复交互.md
- docs/本地服务守护与自动恢复.md
- docs/数据库自动备份与恢复验证.md
- docs/ChatGPT执行台开发记录.md
- docs/ChatGPT动态执行工具与验收.md
- docs/执行任务模块详细设计.md
- docs/测试环境模块开发记录.md
- docs/测试轮次模块开发记录.md
- docs/测试报告模块开发记录.md (includes standalone report index)
- docs/前端按需加载与构建优化记录.md
- docs/前端依赖安全审计与升级.md
- docs/CI与脚本路径安全开发记录.md
- docs/第三十五批-业务表单防重与安全验收.md（需求、设计、用例、脚本、轮次保存防重；Chrome 模拟写入安全回归）
- docs/第三十六批-轮次脚本任务操作安全验收.md（轮次用例增删、脚本启停、任务取消的请求防重和服务端状态复核）
- docs/第三十七批-轮次生命周期与任务幂等验收.md（轮次开始/终止、整轮/单例任务创建防重、丢失响应与刷新页面后沿用幂等键）
- docs/第三十八批-人工执行与恢复安全验收.md（人工开始/结果登记/人工确认拒绝/任务恢复交互防重、服务端状态复核和 Chrome 回归）
- docs/第三十九批-证据附件与任务切换安全验收.md（证据上传防重、SHA-256 和执行尝试归属校验、下载完整性、网络超时回查、Chrome 验收）
- docs/第四十批-真实业务链路与关联用例验收.md（首次真实项目至报告的10步只读验收；后续第44批扩展为12检查点）
- docs/第四十一批-多轮结果对比与复测验收.md（同版本上一已完成轮次、按原始用例ID比对修复/回归失败/范围变化；只读Chrome验收）
- docs/第四十二批-需求到用例创建与上手引导验收.md（零关联需求也能下钻、一键新增用例自动核验来源、严格关联与真实Chrome验收）
- docs/第四十三批-用例直达轮次与版本快照验收.md（已有用例一键加入同版本计划中轮次，通用用例提示与新轮次预选，Chrome隔离验收）
- docs/第四十四批-冻结覆盖与跨环境复测交付验收.md（按冻结需求ID去重的轮次覆盖汇总与设计缺失、跨环境/代码版本复测差异提示）
- docs/正式使用前交付检查清单.md（本地上线/回归/备份/隔离还原与使用边界清单）
- docs/第四十五批-本地发布快照与回滚保护验收.md（JAR快照、只读发布预检、在线/离线回滚受控入口与第45批11项隔离安全测试）
- docs/第四十六批-真实用户流程与离线恢复修复验收.md（修复离线恢复任务判断、用例加入轮次自动打开向导，真实Chrome14步和18项回滚安全验收）
- docs/第四十七批-源码交付审计与本机最终验收.md（339份源码只读审计、Git严格发布门槛、隐藏PowerShell修正、当前JAR快照核对与最终交付边界）
- docs/使用指南-从版本到测试报告.md（按实际使用顺序讲解项目、版本、需求/设计、用例、测试轮次、执行、报告及常见问题）
- docs/开发断点.md
- docs/本地运行验证记录.md
- docs/系统架构.md
- docs/database/数据库设计.md

## Current next steps

1. GitHub repository: `https://github.com/hzhj90-oss/dev-process-manage` (local `main` tracks `origin/main`). `.github/workflows/verify.yml` was previously run successfully on GitHub. Current local changes are intentionally **not committed or pushed**; new CLI and UI tests have only been verified locally so far, and GitHub CI must be rechecked only after an explicitly requested sync.
2. Python/Java Runners and Docker are **explicitly deferred** per user decision (2026-11-11); do not install Docker or implement Python/Java script execution unless the user reopens that scope. Focus subsequent work on existing test execution, reports, and usability.
3. Frontend dependency upgrades are complete; npm lockfile audit shows 0 known vulnerabilities for frontend, Node Runner and Browser Runner. CI now audits moderate-and-higher findings and installs dependencies with `--ignore-scripts`. FILE execution still requires a verifiable OS sandbox and resistance to filesystem races.
## Browser Runner real-database verification (opt-in)

The Chrome Browser Runner supports automatic failure screenshots (`browser-failure.png`) and records `ASSERTION_FAILED` events for failed assertions. A **separate, explicitly opt-in** local regression tests both PASS and intentionally FAIL outcomes through the actual task lease, execution log, PNG attachment download, and HTML test report:

```powershell
cd D:\code\dev-process-manager
$env:DPM_BROWSER_E2E_VERSION_ID = '4'       # replace with your DPM-VERIFY-* project version
$env:DPM_BROWSER_E2E_ALLOW_WRITE = 'YES'
node .\scripts\test-browser-real-db.mjs
```

Prerequisites: the application and Browser Runner must be running locally at `127.0.0.1:18090`. The script accepts only a project whose code starts with `DPM-VERIFY-`, only a TEST/NONE-auth environment on loopback, and creates dedicated test-cycle records (no historical cleanup). It is not part of CI or the default read-only test suite. Browser Runner does not provide OS-level isolation and must not be directed at arbitrary untrusted or production sites.

- Recovery attention UX: the execution task page shows pending/manual/recovery counts (30-second refresh), links directly to filtered tasks, warns when a previously observed Runner is offline, and requires a typed human confirmation before resuming an interrupted case. Fixed scripts may restart from step one; no automatic replay is performed.
