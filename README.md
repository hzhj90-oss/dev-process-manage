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

- Start: run scripts/start.ps1 (or scripts/start.cmd); the script validates Element Plus imports, builds the frontend/backend and starts the JAR.
- UI smoke test: run scripts/test-frontend-smoke.ps1 while the application is running; it checks ten routes in an isolated headless Chrome/Edge profile and cleans up its temporary files.
- Local regression: run scripts/verify-local.ps1 for import checks, HTTP/Node/Browser Runner suites and Java unit tests; add `-IncludeMySql` for MySQL 5.7 integration tests, `-AuditDependencies` for online npm security checks and `-BrowserIntegration` for opt-in Chrome/browser protocol tests.
- Browser Runner: after starting the backend, use scripts/start-browser-runner.ps1 and scripts/stop-browser-runner.ps1; v1 is restricted to admin-approved non-production origins and needs locally installed Chrome.
- Stop: run scripts/stop.ps1 (or scripts/stop.cmd).
- Local DB credentials are loaded from .local/application-local.yml.
- Logs: logs/application.stdout.log and logs/application.stderr.log.

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
- Test reports: standalone sidebar report index with keyword/status filters and pagination; on-demand HTML reports based on immutable cycle/case/requirement/design/environment snapshots, execution attempts, events and evidence attachment links; inline view, HTML download and browser print/save-as-PDF.
- Dashboard: live project and version counts.

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
- Runtime verified on the single local listener 127.0.0.1:18090; health, API and frontend entry all returned HTTP 200. Latest backend PID is 23832; HTTP Runner PID 29376, Node Runner PID 5492 and Browser Runner PID 14784 remain running.
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
- docs/执行任务模块详细设计.md
- docs/测试环境模块开发记录.md
- docs/测试轮次模块开发记录.md
- docs/测试报告模块开发记录.md (includes standalone report index)
- docs/前端按需加载与构建优化记录.md
- docs/前端依赖安全审计与升级.md
- docs/CI与脚本路径安全开发记录.md
- docs/开发断点.md
- docs/本地运行验证记录.md
- docs/系统架构.md
- docs/database/数据库设计.md

## Current next steps

1. CI verification workflow is staged at `.github/workflows/verify.yml`: Java 8, Node 22, frontend, HTTP/Node/Browser Runner policy tests and isolated MySQL 5.7 tests. The local directory has no `.git` or remote repository, so the workflow cannot be triggered until the project is put under source control; no online CI run is claimed.
2. Implement Python/Java Runners only after selecting a verifiable OS-level sandbox; expand Node Runner only if a stronger boundary is available for native Node.js APIs.
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
