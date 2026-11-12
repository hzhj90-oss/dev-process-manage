package com.devprocess.manager.testreport.service;

import com.devprocess.manager.common.web.PageResult;
import com.devprocess.manager.execution.service.ExecutionTaskService;
import com.devprocess.manager.testcycle.dto.TestCycleCaseDTO;
import com.devprocess.manager.testcycle.dto.TestCycleDTO;
import com.devprocess.manager.testcycle.dto.TestCycleRequirementDTO;
import com.devprocess.manager.testcycle.service.TestCycleService;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;

@Service
public class TestReportService {
    private static final int TASK_PAGE_SIZE = 100;
    private static final Pattern SENSITIVE_KEY = Pattern.compile(
            "(?i)(password|passwd|token|authorization|cookie|secret|api[_-]?key|private[_-]?key|access[_-]?key|credential)");
    private static final Pattern SENSITIVE_ASSIGNMENT = Pattern.compile(
            "(?i)(\\b(?:password|passwd|(?:access|refresh|id)[_-]?token|token|authorization|cookie|secret|api[_-]?key|private[_-]?key|credential|client[_-]?secret)\\b\\s*[:=]\\s*)(\"[^\"]*\"|'[^']*'|[^\\s,;]+)");
    private static final Pattern BEARER_VALUE = Pattern.compile("(?i)Bearer\\s+[A-Za-z0-9._~+/-]+=*");
    private static final Pattern AUTHORIZATION_VALUE = Pattern.compile(
            "(?i)(\\b(?:proxy-)?authorization\\b\\s*[:=]\\s*)(?:Bearer|Basic)\\s+[^\\s,;]+");
    private final TestCycleService cycleService;
    private final ExecutionTaskService executionTaskService;
    private final ObjectMapper objectMapper;

    public TestReportService(TestCycleService cycleService, ExecutionTaskService executionTaskService,
            ObjectMapper objectMapper) {
        this.cycleService = cycleService;
        this.executionTaskService = executionTaskService;
        this.objectMapper = objectMapper;
    }


    /**
     * A compact, Excel-readable export of the immutable cycle case snapshots and
     * execution metadata. Deliberately excludes source, snapshots, event bodies,
     * request payloads and logs, even when the underlying task API has them.
     */

    /**
     * Minimal failure-triage view for one test cycle.
     * Never returns the raw task/execution maps, snapshots, logs, or checkpoints.
     */
    /**
     * Compare the current cycle to the nearest older COMPLETED cycle in its version.
     * Uses immutable testCaseId, never case number/title, to avoid false matches after edits.
     * This is a GET-only projection; it never updates test results or creates attempts.
     */
    public Map<String, Object> compare(Long cycleId) {
        TestCycleDTO current = cycleService.get(cycleId);
        TestCycleDTO previous = cycleService.previousCompleted(current);
        Map<String, Object> response = new LinkedHashMap<String, Object>();
        response.put("cycleId", current.getId());
        response.put("cycleName", sanitizeText(current.getCycleName()));
        response.put("cycleNo", current.getCycleNo());
        response.put("cycleStatus", current.getStatus());
        response.put("versionId", current.getVersionId());
        response.put("previousCycleId", previous == null ? null : previous.getId());
        response.put("previousCycleName", previous == null ? null : sanitizeText(previous.getCycleName()));
        response.put("previousCycleNo", previous == null ? null : previous.getCycleNo());
        // Comparison does not imply causality: expose enough immutable context
        // to distinguish different environments and deployments, never credentials.
        response.put("environmentId", current.getEnvironmentId());
        response.put("environmentName", sanitizeText(current.getEnvironmentName()));
        response.put("codeVersion", sanitizeText(current.getCodeVersion()));
        response.put("gitCommit", sanitizeText(current.getGitCommit()));
        response.put("previousEnvironmentId", previous == null ? null : previous.getEnvironmentId());
        response.put("previousEnvironmentName", previous == null ? null
                : sanitizeText(previous.getEnvironmentName()));
        response.put("previousCodeVersion", previous == null ? null
                : sanitizeText(previous.getCodeVersion()));
        response.put("previousGitCommit", previous == null ? null
                : sanitizeText(previous.getGitCommit()));
        response.put("environmentChanged", previous == null
                || previous.getEnvironmentId() == null || current.getEnvironmentId() == null
                ? null : !current.getEnvironmentId().equals(previous.getEnvironmentId()));
        Boolean codeChanged = null;
        if (previous != null && current.getCodeVersion() != null
                && !current.getCodeVersion().trim().isEmpty()
                && previous.getCodeVersion() != null
                && !previous.getCodeVersion().trim().isEmpty()) {
            codeChanged = !current.getCodeVersion().trim().equals(previous.getCodeVersion().trim());
            if (current.getGitCommit() != null && !current.getGitCommit().trim().isEmpty()
                    && previous.getGitCommit() != null && !previous.getGitCommit().trim().isEmpty()) {
                codeChanged = codeChanged
                        || !current.getGitCommit().trim().equals(previous.getGitCommit().trim());
            }
        }
        response.put("codeVersionChanged", codeChanged);

        Map<String, Integer> counts = new LinkedHashMap<String, Integer>();
        for (String key : new String[] {"FIXED", "REGRESSION", "STILL_FAIL",
                "STILL_PASS", "FIRST_PASS", "CHANGED", "NEW_CASE", "REMOVED_CASE"}) {
            counts.put(key, 0);
        }
        List<Map<String, Object>> rows = new ArrayList<Map<String, Object>>();
        response.put("counts", counts);
        response.put("rows", rows);
        response.put("total", 0);
        if (previous == null) return response;

        if (!java.util.Objects.equals(previous.getVersionId(), current.getVersionId())
                || previous.getCycleNo() == null || current.getCycleNo() == null
                || previous.getCycleNo().intValue() >= current.getCycleNo().intValue()
                || !"COMPLETED".equals(previous.getStatus())) {
            throw new IllegalStateException("上一轮测试与当前轮次不匹配");
        }
        Map<Long, TestCycleCaseDTO> earlier = new LinkedHashMap<Long, TestCycleCaseDTO>();
        if (previous.getCases() != null) for (TestCycleCaseDTO item : previous.getCases()) {
            if (item.getTestCaseId() != null && item.getTestCaseId() > 0) {
                if (earlier.put(item.getTestCaseId(), item) != null) {
                    throw new IllegalStateException("上一轮用例存在重复关联");
                }
            }
        }
        java.util.Set<Long> currentIds = new java.util.HashSet<Long>();
        if (current.getCases() != null) for (TestCycleCaseDTO item : current.getCases()) {
            Long caseId = item.getTestCaseId();
            if (caseId != null && caseId > 0 && !currentIds.add(caseId)) {
                throw new IllegalStateException("本轮用例存在重复关联");
            }
            TestCycleCaseDTO old = caseId == null ? null : earlier.get(caseId);
            String before = old == null ? null : normalizedResult(old.getLatestResult());
            String now = normalizedResult(item.getLatestResult());
            String change = old == null ? "NEW_CASE" : compareResult(before, now);
            counts.put(change, counts.get(change) + 1);
            rows.add(compareRow(caseId, item, before, now, change));
        }
        if (previous.getCases() != null) for (TestCycleCaseDTO item : previous.getCases()) {
            Long caseId = item.getTestCaseId();
            if (caseId != null && currentIds.contains(caseId)) continue;
            counts.put("REMOVED_CASE", counts.get("REMOVED_CASE") + 1);
            rows.add(compareRow(caseId, item, normalizedResult(item.getLatestResult()),
                    null, "REMOVED_CASE"));
        }
        response.put("total", rows.size());
        return response;
    }

    private Map<String, Object> compareRow(Long testCaseId, TestCycleCaseDTO item,
            String previousResult, String currentResult, String change) {
        Map<String, Object> row = new LinkedHashMap<String, Object>();
        row.put("testCaseId", testCaseId);
        row.put("caseNo", sanitizeText(item.getCaseNo()));
        row.put("title", sanitizeText(item.getTitle()));
        row.put("previousResult", previousResult);
        row.put("currentResult", currentResult);
        row.put("change", change);
        return row;
    }

    private String normalizedResult(String result) {
        for (String value : new String[] {"PASS", "FAIL", "BLOCKED", "SKIPPED"}) {
            if (value.equals(result)) return value;
        }
        return "NOT_RUN";
    }

    private String compareResult(String before, String after) {
        boolean beforeIssue = "FAIL".equals(before) || "BLOCKED".equals(before);
        boolean afterIssue = "FAIL".equals(after) || "BLOCKED".equals(after);
        if (beforeIssue && "PASS".equals(after)) return "FIXED";
        if ("PASS".equals(before) && afterIssue) return "REGRESSION";
        if (beforeIssue && afterIssue) return "STILL_FAIL";
        if ("PASS".equals(before) && "PASS".equals(after)) return "STILL_PASS";
        if ("PASS".equals(after)) return "FIRST_PASS";
        return "CHANGED";
    }

    public Map<String, Object> review(Long cycleId) {
        TestCycleDTO cycle = cycleService.get(cycleId);
        Map<Long, List<Map<String, Object>>> attemptsByCase = collectAttempts(cycleId);
        List<Map<String, Object>> rows = new ArrayList<Map<String, Object>>();
        Map<String, Integer> counts = new LinkedHashMap<String, Integer>();
        for (String result : new String[] {"PASS", "FAIL", "BLOCKED", "SKIPPED", "NOT_RUN"}) {
            counts.put(result, 0);
        }
        List<TestCycleCaseDTO> cases = cycle.getCases();
        if (cases != null) {
            for (TestCycleCaseDTO item : cases) {
                List<Map<String, Object>> records = attemptsByCase.get(item.getId());
                int attemptCount = records == null ? 0 : records.size();
                Long latestId = null;
                Long latestTaskId = null;
                Map<String, Object> latestExecution = null;
                if (records != null) {
                    for (Map<String, Object> record : records) {
                        Object rawExecution = record.get("execution");
                        if (!(rawExecution instanceof Map)) continue;
                        @SuppressWarnings("unchecked")
                        Map<String, Object> execution = (Map<String, Object>) rawExecution;
                        Long id = asLong(execution.get("id"));
                        if (id != null && (latestId == null || id.longValue() > latestId.longValue())) {
                            latestId = id;
                            latestTaskId = asLong(record.get("taskId"));
                            latestExecution = execution;
                        }
                    }
                }
                String result = item.getLatestResult();
                if (!counts.containsKey(result)) result = "NOT_RUN";
                counts.put(result, counts.get(result) + 1);

                Map<String, Object> row = new LinkedHashMap<String, Object>();
                row.put("cycleCaseId", item.getId());
                row.put("caseNo", sanitizeText(item.getCaseNo()));
                row.put("title", sanitizeText(item.getTitle()));
                row.put("executionMode", item.getExecutionMode());
                row.put("executionStatus", item.getExecutionStatus());
                row.put("latestResult", result);
                row.put("attemptCount", attemptCount);
                row.put("taskId", latestTaskId);
                row.put("executionId", latestId);
                row.put("runnerType", latestExecution == null ? null : latestExecution.get("runnerType"));
                row.put("attemptStatus", latestExecution == null ? null : latestExecution.get("executionStatus"));
                rows.add(row);
            }
        }
        Map<String, Object> response = new LinkedHashMap<String, Object>();
        response.put("cycleId", cycle.getId());
        response.put("cycleName", sanitizeText(cycle.getCycleName()));
        response.put("cycleStatus", cycle.getStatus());
        response.put("counts", counts);
        response.put("total", rows.size());
        response.put("rows", rows);
        return response;
    }

    public String generateCsv(Long cycleId) {
        TestCycleDTO cycle = cycleService.get(cycleId);
        Map<Long, List<Map<String, Object>>> attemptsByCase = collectAttempts(cycleId);
        StringBuilder csv = new StringBuilder(8192);
        csv.append('\uFEFF');
        appendCsvRow(csv, "项目", "版本", "测试轮次", "轮次状态", "环境",
                "用例编号", "用例名称", "执行模式", "执行状态", "最终结果",
                "执行次数", "最近执行ID", "最近Runner", "最近执行状态");
        List<TestCycleCaseDTO> cases = cycle.getCases();
        if (cases == null) return csv.toString();
        for (TestCycleCaseDTO item : cases) {
            List<Map<String, Object>> attempts = attemptsByCase.get(item.getId());
            int totalAttempts = attempts == null ? 0 : attempts.size();
            Map<String, Object> latest = null;
            long latestId = 0L;
            if (attempts != null) {
                for (Map<String, Object> attempt : attempts) {
                    Object raw = attempt.get("execution");
                    if (!(raw instanceof Map)) continue;
                    @SuppressWarnings("unchecked")
                    Map<String, Object> execution = (Map<String, Object>) raw;
                    Long candidate = asLong(execution.get("id"));
                    if (candidate != null && candidate.longValue() > latestId) {
                        latestId = candidate.longValue();
                        latest = execution;
                    }
                }
            }
            appendCsvRow(csv, cycle.getProjectName(), cycle.getVersionNo(),
                    cycle.getCycleName(), cycle.getStatus(), cycle.getEnvironmentName(),
                    item.getCaseNo(), item.getTitle(), item.getExecutionMode(),
                    item.getExecutionStatus(), item.getLatestResult(),
                    totalAttempts, latestId == 0L ? null : latestId,
                    latest == null ? null : latest.get("runnerType"),
                    latest == null ? null : latest.get("executionStatus"));
        }
        return csv.toString();
    }

    private void appendCsvRow(StringBuilder csv, Object... values) {
        for (int i = 0; i < values.length; i++) {
            if (i > 0) csv.append(',');
            String text = values[i] == null ? "" : sanitizeText(String.valueOf(values[i]));
            // Keep spreadsheet cells bounded and neutralize multiline/control data.
            text = text.replaceAll("[\\p{Cntrl}]", " ");
            if (text.length() > 512) text = text.substring(0, 512);
            // A quoted CSV field is still interpreted as a formula by Excel/LibreOffice.
            if (text.matches("(?s)^\\s*[=+\\-@＝＋－＠].*")) {
                text = "'" + text;
            }
            csv.append('"').append(text.replace("\"", "\"\"")).append('"');
        }
        csv.append("\r\n");
    }

    public String generateHtml(Long cycleId) {
        return generateHtml(cycleId, "");
    }

    public String generateHtml(Long cycleId, String baseUrl) {
        TestCycleDTO cycle = cycleService.get(cycleId);
        Map<Long, List<Map<String, Object>>> attemptsByCycleCase = collectAttempts(cycleId);
        StringBuilder html = new StringBuilder(16384);
        JsonNode environment = sanitizedJson(cycle.getEnvironmentSnapshotJson());
        // 轮次可能尚未保存环境快照（例如历史数据），缺失时使用轮次基础字段，避免报告生成失败。
        html.append("<!doctype html><html lang=\"zh-CN\"><head><meta charset=\"UTF-8\">")
            .append("<meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">")
            .append("<title>").append(escape(cycle.getCycleName())).append(" - 测试报告</title>")
            .append(styles()).append("</head><body><main class=\"report\">")
            .append("<div class=\"toolbar\"><span>测试报告 · Dev Process Manager</span>")
            .append("<button onclick=\"window.print()\">打印 / 另存为 PDF</button></div>")
            .append("<header><div class=\"eyebrow\">TEST EXECUTION REPORT</div><h1>")
            .append(escape(cycle.getCycleName())).append("</h1><p>")
            .append(escape(cycle.getProjectName())).append(" / ")
            .append(escape(cycle.getVersionNo())).append(" · 第 ")
            .append(cycle.getCycleNo()).append(" 轮</p></header>");
        html.append("<section class=\"meta-grid\">")
            .append(meta("状态", statusLabel(cycle.getStatus())))
            .append(meta("测试阶段", cycle.getCycleStage()))
            .append(meta("测试环境", jsonText(environment, "environmentName", cycle.getEnvironmentName())))
            .append(meta("环境类型", jsonText(environment, "environmentType", "—")))
            .append(meta("环境地址", jsonText(environment, "baseUrl", "—")))
            .append(meta("API 地址", jsonText(environment, "apiBaseUrl", "—")))
            .append(meta("认证方式", jsonText(environment, "authType", "NONE")))
            .append(meta("凭据引用", jsonText(environment, "credentialRef", "—")))
            .append(meta("代码版本", cycle.getCodeVersion()))
            .append(meta("Git 分支", cycle.getGitBranch()))
            .append(meta("Git Commit", cycle.getGitCommit()))
            .append(meta("构建编号", cycle.getBuildNo()))
            .append(meta("开始时间", value(cycle.getStartedAt())))
            .append(meta("完成时间", value(cycle.getCompletedAt())))
            .append("</section>");
        String configJson = jsonText(environment, "configJson", null);
        if (configJson != null && !configJson.trim().isEmpty()) {
            JsonNode config = sanitizedJson(configJson);
            html.append("<section><h2>环境参数快照（脱敏）</h2><pre>")
                    .append(config == null ? escape(configJson) : escapeHtml(config.toPrettyString()))
                    .append("</pre></section>");
        }
        html.append("<section><h2>执行结果概览</h2><div class=\"stats\">")
            .append(stat("用例总数", cycle.getCaseCount(), ""))
            .append(stat("通过", cycle.getPassCount(), "pass"))
            .append(stat("失败", cycle.getFailCount(), "fail"))
            .append(stat("阻塞", cycle.getBlockedCount(), "blocked"))
            .append(stat("跳过", cycle.getSkippedCount(), "skipped"))
            .append(stat("未执行", cycle.getNotRunCount(), "pending"))
            .append("</div></section>");
        html.append("<section><h2>测试范围与说明</h2><div class=\"text-panel\">")
            .append("<p>").append(escape(cycle.getDescription())).append("</p>");
        JsonNode scope = sanitizedJson(cycle.getScopeJson());
        if (scope != null) html.append("<pre>").append(escapeHtml(scope.toPrettyString())).append("</pre>");
        html.append("</div></section><section><h2>用例执行明细</h2>");
        List<TestCycleCaseDTO> cases = cycle.getCases() == null
                ? new ArrayList<TestCycleCaseDTO>() : cycle.getCases();
        for (TestCycleCaseDTO item : cases) {
            html.append(renderCase(item, attemptsByCycleCase.get(item.getId()), baseUrl));
        }
        if (cases.isEmpty()) html.append("<p class=\"empty\">本轮没有测试用例。</p>");
        html.append("</section><footer>报告生成时间：")
            .append(java.time.LocalDateTime.now()).append(" · 数据来源：测试轮次快照与执行历史</footer>")
            .append("</main></body></html>");
        return html.toString();
    }

    /**
     * 父任务展开为用例子任务；单用例任务则直接读取自身执行记录。
     * 报告只查询当前轮次，并跳过父任务行中的重复记录。
     */
    @SuppressWarnings("unchecked")
    private Map<Long, List<Map<String, Object>>> collectAttempts(Long cycleId) {
        Map<Long, List<Map<String, Object>>> result = new HashMap<Long, List<Map<String, Object>>>();
        int pageNum = 1;
        while (true) {
            PageResult<Map<String, Object>> page = executionTaskService.page(
                    null, cycleId, null, pageNum, TASK_PAGE_SIZE);
            List<Map<String, Object>> rows = page.getList();
            if (rows == null || rows.isEmpty()) break;
            for (Map<String, Object> row : rows) {
                if (row.get("parentTaskId") != null) continue;
                Long taskId = asLong(row.get("id"));
                if (taskId == null) continue;
                Map<String, Object> detail = executionTaskService.get(taskId);
                Object children = detail.get("children");
                if (children instanceof List) {
                    for (Object child : (List<?>) children) {
                        if (child instanceof Map) addTaskAttempts((Map<String, Object>) child, result);
                    }
                } else {
                    Object rawTask = detail.get("task");
                    if (rawTask instanceof Map) {
                        Map<String, Object> directTask = new LinkedHashMap<String, Object>(
                                (Map<String, Object>) rawTask);
                        directTask.put("executions", detail.get("executions"));
                        addTaskAttempts(directTask, result);
                    }
                }
            }
            if ((long) pageNum * TASK_PAGE_SIZE >= page.getTotal()) break;
            pageNum++;
        }
        return result;
    }
    private void addTaskAttempts(Map<String, Object> task,
            Map<Long, List<Map<String, Object>>> target) {
        Long cycleCaseId = asLong(task.get("cycleCaseId"));
        if (cycleCaseId == null) return;
        Object executions = task.get("executions");
        if (!(executions instanceof List)) return;
        List<Map<String, Object>> attempts = target.get(cycleCaseId);
        if (attempts == null) {
            attempts = new ArrayList<Map<String, Object>>();
            target.put(cycleCaseId, attempts);
        }
        for (Object item : (List<?>) executions) {
            if (!(item instanceof Map)) continue;
            Map<String, Object> record = new LinkedHashMap<String, Object>();
            record.put("taskId", task.get("id"));
            record.put("taskStatus", task.get("taskStatus"));
            record.put("execution", item);
            attempts.add(record);
        }
    }

    private String renderCase(TestCycleCaseDTO item, List<Map<String, Object>> attempts, String baseUrl) {
        JsonNode snapshot = sanitizedJson(item.getCaseSnapshotJson());
        StringBuilder html = new StringBuilder();
        html.append("<article class=\"case-card\"><div class=\"case-head\"><div><span class=\"case-no\">")
            .append(escape(item.getCaseNo())).append("</span><h3>")
            .append(escape(item.getTitle())).append("</h3><small>快照 V")
            .append(item.getRevisionNo()).append(" · ").append(escape(item.getExecutionMode()))
            .append("</small></div><span class=\"result ")
            .append(resultClass(item.getLatestResult())).append("\">")
            .append(resultLabel(item.getLatestResult())).append("</span></div>");
        if (snapshot != null) {
            html.append("<div class=\"case-content\">");
            if (snapshot.hasNonNull("preconditions")) {
                html.append("<p><b>前置条件：</b>").append(escape(snapshot.path("preconditions").asText())).append("</p>");
            }
            JsonNode steps = snapshot.path("steps");
            if (steps.isArray() && !steps.isEmpty()) {
                html.append("<h4>测试步骤</h4><ol>");
                for (JsonNode step : steps) {
                    html.append("<li><b>").append(escape(step.path("stepNo").asText())).append(". ")
                        .append(escape(step.path("action").asText()))
                        .append("</b><div>预期结果：").append(escape(step.path("expectedResult").asText())).append("</div>");
                    if (step.hasNonNull("testData")) {
                        html.append("<div>操作数据：").append(escape(step.path("testData").asText())).append("</div>");
                    }
                    html.append("</li>");
                }
                html.append("</ol>");
            }
            JsonNode testData = snapshot.path("testData");
            if (!testData.isMissingNode() && !testData.isNull()) {
                html.append("<h4>测试数据快照（脱敏）</h4><pre>")
                        .append(escapeHtml(testData.toPrettyString())).append("</pre>");
            }
            if (snapshot.hasNonNull("aiInstruction")) {
                html.append("<h4>ChatGPT 执行指令</h4><pre>")
                        .append(escape(snapshot.path("aiInstruction").asText())).append("</pre>");
            }
            html.append("<p><b>整体预期结果：</b>")
                .append(escape(snapshot.path("expectedResult").asText())).append("</p>");
            html.append("</div>");
        }
        if (item.getRequirements() != null && !item.getRequirements().isEmpty()) {
            html.append("<div class=\"coverage\"><b>需求覆盖：</b>");
            for (TestCycleRequirementDTO requirement : item.getRequirements()) {
                html.append("<div class=\"coverage-item\"><span>")
                    .append(escape(requirement.getRequirementNo()))
                    .append(" · ").append(escape(requirement.getTitle()))
                    .append("（").append(escape(requirement.getCoverageType())).append("）</span>");
                JsonNode requirementSnapshot = sanitizedJson(requirement.getRequirementSnapshotJson());
                if (requirementSnapshot != null && requirementSnapshot.hasNonNull("contentMarkdown")) {
                    html.append("<div class=\"snapshot-text\"><b>需求内容</b><pre>")
                            .append(escape(requirementSnapshot.path("contentMarkdown").asText()))
                            .append("</pre></div>");
                }
                JsonNode designSnapshot = sanitizedJson(requirement.getDesignSnapshotJson());
                if (designSnapshot != null) {
                    html.append("<div class=\"design-snapshot\"><b>详细设计 V")
                            .append(escape(designSnapshot.path("revisionNo").asText()))
                            .append(" · ").append(escape(designSnapshot.path("title").asText()))
                            .append("</b>");
                    if (designSnapshot.hasNonNull("contentMarkdown")) {
                        html.append("<pre>").append(escape(designSnapshot.path("contentMarkdown").asText()))
                                .append("</pre>");
                    }
                    html.append("</div>");
                }
                html.append("</div>");
            }
            html.append("</div>");
        }
        html.append(renderAttempts(attempts, baseUrl));
        html.append("</article>");
        return html.toString();
    }
    @SuppressWarnings("unchecked")
    private String renderAttempts(List<Map<String, Object>> attempts, String baseUrl) {
        StringBuilder html = new StringBuilder("<div class=\"attempts\"><h4>执行记录</h4>");
        if (attempts == null || attempts.isEmpty()) {
            return html.append("<p class=\"empty\">尚无执行记录。</p></div>").toString();
        }
        for (Map<String, Object> record : attempts) {
            Object raw = record.get("execution");
            if (!(raw instanceof Map)) continue;
            Map<String, Object> execution = (Map<String, Object>) raw;
            Long taskId = asLong(record.get("taskId"));
            Long executionId = asLong(execution.get("id"));
            html.append("<div class=\"attempt\"><div class=\"attempt-head\"><b>第 ")
                .append(escape(execution.get("attemptNo"))).append(" 次执行</b><span>")
                .append(escape(execution.get("runnerType"))).append(" / ")
                .append(escape(execution.get("executionStatus"))).append(" / ")
                .append("<strong class=\"result ").append(resultClass(value(execution.get("result"))))
                .append("\">").append(resultLabel(value(execution.get("result"))))
                .append("</strong></span></div>");
            html.append("<div class=\"attempt-meta\">执行人：")
                .append(escape(execution.get("executorName"))).append(" · 开始：")
                .append(escape(execution.get("startedAt"))).append(" · 结束：")
                .append(escape(execution.get("completedAt"))).append("</div>");
            if (execution.get("actualResult") != null) {
                html.append("<p><b>实际结果：</b>").append(escape(execution.get("actualResult"))).append("</p>");
            }
            if (execution.get("logExcerpt") != null) {
                html.append("<details><summary>执行日志</summary><pre>")
                    .append(escape(execution.get("logExcerpt"))).append("</pre></details>");
            }
            html.append(renderAttachments(taskId, executionId, execution.get("attachments"), baseUrl));
            html.append(renderEvents(execution.get("events")));
            html.append("</div>");
        }
        return html.append("</div>").toString();
    }

    @SuppressWarnings("unchecked")
    private String renderAttachments(Long taskId, Long executionId, Object rawAttachments, String baseUrl) {
        StringBuilder html = new StringBuilder("<div class=\"attachments\"><b>证据附件：</b>");
        if (!(rawAttachments instanceof List) || ((List<?>) rawAttachments).isEmpty()) {
            return html.append("<span>无</span></div>").toString();
        }
        for (Object raw : (List<?>) rawAttachments) {
            if (!(raw instanceof Map)) continue;
            Map<String, Object> attachment = (Map<String, Object>) raw;
            Long id = asLong(attachment.get("id"));
            if (id == null || taskId == null || executionId == null) continue;
            String path = "/api/execution-tasks/" + taskId + "/executions/" + executionId
                    + "/attachments/" + id;
            String prefix = baseUrl == null ? "" : baseUrl.trim().replaceAll("/+$", "");
            String href = prefix + path;
            html.append("<a href=\"").append(escape(href)).append("\">")
                .append(escape(attachment.get("fileName"))).append("</a> <small>")
                .append(escape(attachment.get("attachmentType"))).append(" · ")
                .append(escape(attachment.get("fileSize"))).append(" bytes</small>");
        }
        return html.append("</div>").toString();
    }
    @SuppressWarnings("unchecked")
    private String renderEvents(Object rawEvents) {
        if (!(rawEvents instanceof List) || ((List<?>) rawEvents).isEmpty()) return "";
        StringBuilder html = new StringBuilder("<details class=\"events\"><summary>执行事件（")
                .append(((List<?>) rawEvents).size()).append("）</summary><ol>");
        for (Object raw : (List<?>) rawEvents) {
            if (!(raw instanceof Map)) continue;
            Map<String, Object> event = (Map<String, Object>) raw;
            html.append("<li><b>").append(escape(event.get("eventType"))).append("</b> · ")
                .append(escape(event.get("eventContent"))).append(" <small>")
                .append(escape(event.get("createdAt"))).append("</small></li>");
        }
        return html.append("</ol></details>").toString();
    }

    private JsonNode sanitizedJson(String json) {
        if (json == null || json.trim().isEmpty()) return null;
        try {
            return sanitize(objectMapper.readTree(json));
        } catch (Exception ignored) {
            return null;
        }
    }

    private JsonNode sanitize(JsonNode node) {
        if (node == null || node.isNull()) return node;
        if (node.isTextual()) {
            return objectMapper.getNodeFactory().textNode(sanitizeText(node.asText()));
        }
        if (node.isObject()) {
            ObjectNode copy = objectMapper.createObjectNode();
            Iterator<Map.Entry<String, JsonNode>> fields = node.fields();
            while (fields.hasNext()) {
                Map.Entry<String, JsonNode> field = fields.next();
                if (isSensitive(field.getKey())) copy.put(field.getKey(), "[REDACTED]");
                else copy.set(field.getKey(), sanitize(field.getValue()));
            }
            return copy;
        }
        if (node.isArray()) {
            ArrayNode copy = objectMapper.createArrayNode();
            for (JsonNode child : node) copy.add(sanitize(child));
            return copy;
        }
        return node.deepCopy();
    }

    private String sanitizeText(String value) {
        if (value == null) return null;
        String trimmed = value.trim();
        // 配置快照可能把 JSON 再序列化为字符串，需要递归脱敏，不能只检查最外层字段名。
        if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
            try {
                JsonNode nested = objectMapper.readTree(trimmed);
                if (nested.isObject() || nested.isArray()) {
                    return objectMapper.writeValueAsString(sanitize(nested));
                }
            } catch (Exception ignored) {
                // 普通文本也可能以 { 或 [ 开头；不是合法 JSON 时继续执行文本规则。
            }
        }
        String safe = AUTHORIZATION_VALUE.matcher(value).replaceAll("$1[REDACTED]");
        safe = BEARER_VALUE.matcher(safe).replaceAll("Bearer [REDACTED]");
        return SENSITIVE_ASSIGNMENT.matcher(safe).replaceAll("$1[REDACTED]");
    }

    private boolean isSensitive(String key) {
        return key != null && SENSITIVE_KEY.matcher(key).find();
    }

    private String jsonText(JsonNode node, String field, String fallback) {
        return node == null ? fallback : node.path(field).asText(fallback);
    }

    private String meta(String label, Object value) {
        return "<div><label>" + escape(label) + "</label><strong>" + escape(value) + "</strong></div>";
    }

    private String stat(String label, Object value, String css) {
        return "<div class=\"stat " + css + "\"><span>" + escape(label) + "</span><strong>"
                + escape(value == null ? 0 : value) + "</strong></div>";
    }

    private String resultLabel(String value) {
        if ("PASS".equals(value)) return "通过";
        if ("FAIL".equals(value)) return "失败";
        if ("BLOCKED".equals(value)) return "阻塞";
        if ("SKIPPED".equals(value)) return "跳过";
        if ("NOT_RUN".equals(value) || value == null) return "未执行";
        return value;
    }

    private String resultClass(String value) {
        if ("PASS".equals(value)) return "pass";
        if ("FAIL".equals(value)) return "fail";
        if ("BLOCKED".equals(value)) return "blocked";
        if ("SKIPPED".equals(value)) return "skipped";
        return "pending";
    }

    private String statusLabel(String value) {
        if ("COMPLETED".equals(value)) return "已完成";
        if ("ABORTED".equals(value)) return "已终止";
        if ("RUNNING".equals(value)) return "进行中";
        if ("PLANNED".equals(value)) return "计划中";
        return value;
    }

    private String value(Object value) {
        return value == null ? "—" : String.valueOf(value);
    }
    private Long asLong(Object value) {
        if (value instanceof Number) return ((Number) value).longValue();
        if (value == null) return null;
        try { return Long.valueOf(String.valueOf(value)); }
        catch (NumberFormatException ignored) { return null; }
    }

    private String escape(Object value) {
        if (value == null) return "—";
        return escapeHtml(sanitizeText(String.valueOf(value)));
    }

    private String escapeHtml(String value) {
        if (value == null) return "—";
        return value.replace("&", "&amp;").replace("<", "&lt;")
                .replace(">", "&gt;").replace("\"", "&quot;").replace("'", "&#39;");
    }

    private String styles() {
        return "<style>"
            + "body{margin:0;background:#f3f5f9;color:#243247;font:14px/1.65 Arial,'Microsoft YaHei',sans-serif}"
            + ".report{max-width:1120px;margin:28px auto;padding:0 28px 40px}"
            + ".toolbar{display:flex;justify-content:space-between;align-items:center;margin-bottom:26px;color:#718096}"
            + "button{border:0;border-radius:7px;padding:9px 16px;background:#245fce;color:#fff;cursor:pointer}"
            + "header{padding:30px 34px;background:#142b4a;color:#fff;border-radius:12px}"
            + ".eyebrow{font-size:11px;letter-spacing:2px;color:#9eb8dc}h1{font-size:30px;margin:8px 0}header p{color:#c5d3e7;margin:0}"
            + "section{margin-top:24px}h2{font-size:19px;margin:0 0 13px}h3{font-size:17px;margin:2px 0}h4{margin:14px 0 8px}"
            + ".meta-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:1px;background:#e5eaf1;border:1px solid #e5eaf1;border-radius:10px;overflow:hidden}"
            + ".meta-grid>div{background:#fff;padding:13px 16px;min-width:0}.meta-grid label{display:block;color:#8491a4;font-size:12px}.meta-grid strong{display:block;overflow-wrap:anywhere}"
            + ".stats{display:grid;grid-template-columns:repeat(6,1fr);gap:10px}.stat{background:#fff;border:1px solid #e8edf3;border-radius:9px;padding:13px}.stat span{display:block;color:#7a8799;font-size:12px}.stat strong{font-size:24px}"
            + ".stat.pass{border-top:3px solid #28a36a}.stat.fail{border-top:3px solid #d84a4a}.stat.blocked{border-top:3px solid #d68a22}.stat.skipped{border-top:3px solid #8b7acb}.stat.pending{border-top:3px solid #9aa6b6}"
            + ".text-panel,.case-card{background:#fff;border:1px solid #e7ebf1;border-radius:10px;padding:18px;margin-bottom:14px}.text-panel pre,pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#f6f8fb;padding:10px;border-radius:6px}"
            + ".case-head,.attempt-head{display:flex;justify-content:space-between;gap:16px;align-items:flex-start}.case-no{font-size:12px;color:#6f7e92}.case-head small,.attempt-meta,small{color:#8793a4}"
            + ".result{display:inline-block;border-radius:20px;padding:3px 10px;background:#eef1f5;font-size:12px;white-space:nowrap}.result.pass{background:#e5f6ed;color:#167348}.result.fail{background:#fdeaea;color:#b32e2e}.result.blocked{background:#fff3df;color:#99600c}.result.skipped{background:#f0edfb;color:#6653a9}"
            + ".case-content,.coverage{margin-top:14px;border-top:1px solid #edf0f4;padding-top:10px}.case-content li{padding:4px 0}"
            + ".coverage-item{margin-top:10px;padding:10px;border:1px solid #edf0f4;border-radius:7px}.coverage-item>span{display:inline-block;padding:3px 8px;background:#f1f4f8;border-radius:5px;font-size:12px}"
            + ".snapshot-text,.design-snapshot{margin-top:9px}.snapshot-text pre,.design-snapshot pre{margin:6px 0 0;background:#f8f9fc}"
            + ".attempts{margin-top:15px}.attempt{border-top:1px solid #edf0f4;padding:12px 0}.attempt-meta{font-size:12px;margin:5px 0}.attachments a{margin-right:12px}.events{margin-top:8px;font-size:12px}.events li{padding:3px 0}.empty{color:#98a2b1}footer{margin-top:32px;text-align:center;color:#929dad;font-size:12px}"
            + "@media(max-width:760px){.report{padding:0 12px}.meta-grid{grid-template-columns:repeat(2,1fr)}.stats{grid-template-columns:repeat(3,1fr)}header{padding:22px}h1{font-size:24px}}"
            + "@media print{body{background:#fff}.report{max-width:none;margin:0;padding:0}.toolbar{display:none}header{border-radius:0;print-color-adjust:exact;-webkit-print-color-adjust:exact}.case-card,.meta-grid,.stat{break-inside:avoid;box-shadow:none}.case-card{page-break-inside:avoid}a{color:#1b4e98;text-decoration:underline}}"
            + "</style>";
    }
}
