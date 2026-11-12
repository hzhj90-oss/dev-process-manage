# 测试报告 CSV 导出与验收

> 2026-11-11 第十九批。Docker/Python/Java 执行器按用户最新决定暂缓开发；本批只完善已有报表功能，不开发登录与权限。

## 功能

- 入口：`http://127.0.0.1:18090/#/test-reports`，在测试轮次的「操作」列点 **下载 CSV**。
- API：`GET /api/test-cycles/{id}/report.csv`。响应 `text/csv;charset=UTF-8`、附件 `test-cycle-{id}-report.csv`、`Cache-Control: no-store` 和 `X-Content-Type-Options: nosniff`。
- UTF-8 BOM、CRLF 换行，Excel 可打开。每个用例一行，包含项目、版本、轮次、轮次状态、环境、用例编号、用例名称、执行模式、执行状态、最终结果、执行次数、最近执行 ID、Runner 类型、最近执行状态。
- 导出以轮次快照和最新执行记录为准；某个用例多次尝试时次数累计，最近尝试取最大的 execution ID。没有执行记录的用例也导出，执行次数为 0。
- 字段严格白名单，不包含原始请求快照、脚本内容、环境配置、日志、事件正文、检查点及凭据。
- CSV 单元格处理引号、换行/控制字符，限制单字段长度，并对公式前缀（包括 Unicode 全角字符）做文本保护。敏感名称和值使用已有后端文本脱敏逻辑。

## 验证结果

- 后端 Maven：60 项（59 通过，1 项 Windows 符号链接条件下跳过）。
- 新增 `TestReportCsvServiceTest` 两项：真实多尝试计数及最新执行选择、注入字符与密码脱敏、没有执行的用例、空轮次。
- `TestReportControllerTest` 增加 CSV 文件名、MIME、缓存、嗅探防护的接口单测。
- 完整 Chrome 冒烟：11/11 路由通过。
- 新增 `runner/browser-runner/browser-report-csv-smoke.mjs` 并加入 `scripts/test-browser-integration.ps1`：真实浏览器下载现有轮次 46、包含用例 1 条，核对 BOM、表头、CRLF、用例数量、敏感字段不存在、全过程 POST/PUT/PATCH/DELETE 数为 0；`BROWSER_REPORT_CSV_PASS cycle=46 cases=1 writeRequests=0`。
- `scripts/verify-local.ps1 -AuditDependencies -IncludeMySql -BrowserIntegration` 全回归成功：HTTP 7、Node 11、Browser DSL 12、ChatGPT 24、MySQL 集成 5、Java 60（59 通过 1 跳过）、三套 npm 安全审计 0 已知漏洞、浏览器各种真实场景和 CSV 下载均通过。
- 实际 `GET /api/test-cycles/46/report.csv` 返回 HTTP 200、UTF-8 CSV。无数据库写入，原执行结果未变。

## 本机范围与计划

- 经过程序与卸载记录、服务和命令检查，本机未发现 Docker 或 Podman，无需卸载。
- 删除第十九批前半段刚创建但未集成的 `runner/container-runner` 四份实验文件（`sandbox.mjs`、`sandbox.test.mjs`、`guest-python.py`、`doctor.mjs`），目录不再存在；现有三类 Runner 原样保留。
- Python/Java/Docker 及 OS 沙箱开发 **暂停**，除非用户以后明确要求恢复，不再列为当前必做项。
- 下一步继续完成现有测试轮次/用例/报告操作的异常边界、使用流程和整体验收；暂不新增执行器语言。
