package com.devprocess.manager.testreport.service;

import com.devprocess.manager.common.web.PageResult;
import com.devprocess.manager.execution.service.ExecutionTaskService;
import com.devprocess.manager.testcycle.dto.TestCycleCaseDTO;
import com.devprocess.manager.testcycle.dto.TestCycleDTO;
import com.devprocess.manager.testcycle.dto.TestCycleRequirementDTO;
import com.devprocess.manager.testcycle.service.TestCycleService;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class TestReportServiceTest {
    @Test
    void reportMustRenderCycleSnapshotExecutionAndEvidenceWithoutLeakingSecrets() {
        TestCycleService cycles = mock(TestCycleService.class);
        ExecutionTaskService tasks = mock(ExecutionTaskService.class);
        TestCycleDTO cycle = new TestCycleDTO();
        cycle.setId(5L);
        cycle.setCycleNo(2);
        cycle.setCycleName("Regression <script>");
        cycle.setProjectName("Project A");
        cycle.setVersionNo("1.2.0");
        cycle.setEnvironmentName("DEV");
        cycle.setStatus("COMPLETED");
        cycle.setCaseCount(1L);
        cycle.setPassCount(1L);
        cycle.setFailCount(0L);
        cycle.setBlockedCount(0L);
        cycle.setSkippedCount(0L);
        cycle.setNotRunCount(0L);
        cycle.setEnvironmentSnapshotJson("{\"environmentName\":\"DEV\",\"baseUrl\":\"http://localhost?access_token=env-url-token\",\"authType\":\"NONE\",\"credentialRef\":\"cred-dev\",\"configJson\":\"{\\\"password\\\":\\\"env-secret\\\",\\\"region\\\":\\\"cn\\\"}\"}");
        cycle.setScopeJson("{\"password\":\"secret-value\",\"api_key\":\"api-secret-value\",\"module\":\"login\"}");
        TestCycleCaseDTO testCase = new TestCycleCaseDTO();
        testCase.setId(50L);
        testCase.setCaseNo("TC-001");
        testCase.setTitle("Login <admin>");
        testCase.setRevisionNo(3);
        testCase.setExecutionMode("AI");
        testCase.setLatestResult("PASS");
        testCase.setCaseSnapshotJson("{\"preconditions\":\"<script>alert(1)</script>\",\"steps\":[{\"stepNo\":1,\"action\":\"Open login\",\"expectedResult\":\"Login page\",\"testData\":\"demo\"}],\"testData\":{\"password\":\"test-secret\",\"api_key\":\"test-api-secret\"},\"aiInstruction\":\"Use Authorization: Bearer super-secret-token and Authorization: Basic basic-secret\",\"expectedResult\":\"Login succeeds\"}");
        TestCycleRequirementDTO requirement = new TestCycleRequirementDTO();
        requirement.setRequirementNo("REQ-001");
        requirement.setTitle("Login requirement");
        requirement.setCoverageType("DIRECT");
        requirement.setRequirementSnapshotJson("{\"contentMarkdown\":\"Requirement password=doc-secret\"}");
        requirement.setDesignSnapshotJson("{\"revisionNo\":2,\"title\":\"Login design\",\"contentMarkdown\":\"Authorization: Bearer design-secret\"}");
        testCase.setRequirements(Collections.singletonList(requirement));
        cycle.setCases(Collections.singletonList(testCase));
        when(cycles.get(5L)).thenReturn(cycle);

        Map<String, Object> taskRow = row("id", 10L, "parentTaskId", null);
        when(tasks.page(null, 5L, null, 1, 100))
                .thenReturn(new PageResult<Map<String, Object>>(Collections.singletonList(taskRow), 1, 1, 100));
        Map<String, Object> task = row("id", 10L, "cycleCaseId", 50L, "taskStatus", "COMPLETED");
        Map<String, Object> attachment = row("id", 40L, "fileName", "proof.png",
                "attachmentType", "SCREENSHOT", "fileSize", 8L);
        Map<String, Object> event = row("eventType", "ASSERTION_PASSED",
                "eventContent", "assertion passed", "createdAt", "2026-11-10T12:00:00");
        Map<String, Object> execution = row("id", 30L, "attemptNo", 1, "runnerType", "CHATGPT",
                "executionStatus", "COMPLETED", "result", "PASS", "actualResult", "HTTP 200",
                "executorName", "ChatGPT", "attachments", Collections.singletonList(attachment),
                "events", Collections.singletonList(event));
        Map<String, Object> detail = row("task", task, "executions", Collections.singletonList(execution));
        when(tasks.get(10L)).thenReturn(detail);

        TestReportService service = new TestReportService(cycles, tasks, new ObjectMapper());
        String html = service.generateHtml(5L);

        assertTrue(html.contains("Regression &lt;script&gt;"));
        assertTrue(html.contains("凭据引用"));
        assertFalse(html.contains("cred-dev"));
        assertTrue(html.contains("cn"));
        assertTrue(html.contains("TC-001"));
        assertTrue(html.contains("REQ-001"));
        assertTrue(html.contains("Requirement"));
        assertTrue(html.contains("Login design"));
        assertTrue(html.contains("HTTP 200"));
        assertTrue(html.contains("assertion passed"));
        assertTrue(html.contains("/api/execution-tasks/10/executions/30/attachments/40"));
        assertTrue(html.contains("&lt;script&gt;alert(1)&lt;/script&gt;"));
        assertTrue(html.contains("[REDACTED]"));
        assertFalse(html.contains("secret-value"));
        assertFalse(html.contains("api-secret-value"));
        assertFalse(html.contains("env-url-token"));
        assertFalse(html.contains("env-secret"));
        assertFalse(html.contains("test-secret"));
        assertFalse(html.contains("test-api-secret"));
        assertFalse(html.contains("super-secret-token"));
        assertFalse(html.contains("basic-secret"));
        assertFalse(html.contains("doc-secret"));
        assertFalse(html.contains("design-secret"));

        String absoluteHtml = service.generateHtml(5L, "https://reports.example/context/");
        assertTrue(absoluteHtml.contains(
                "https://reports.example/context/api/execution-tasks/10/executions/30/attachments/40"));
    }

    @Test
    void reportMustReadChildAttemptsAndTolerateMissingEnvironmentSnapshot() {
        TestCycleService cycles = mock(TestCycleService.class);
        ExecutionTaskService tasks = mock(ExecutionTaskService.class);
        TestCycleDTO cycle = new TestCycleDTO();
        cycle.setId(6L);
        cycle.setCycleName("Cycle without environment snapshot");
        cycle.setEnvironmentName("LEGACY-DEV");
        TestCycleCaseDTO testCase = new TestCycleCaseDTO();
        testCase.setId(60L);
        testCase.setCaseNo("TC-CHILD");
        testCase.setTitle("Child task case");
        testCase.setLatestResult("FAIL");
        cycle.setCases(Collections.singletonList(testCase));
        when(cycles.get(6L)).thenReturn(cycle);

        Map<String, Object> parentRow = row("id", 100L, "parentTaskId", null);
        when(tasks.page(null, 6L, null, 1, 100))
                .thenReturn(new PageResult<Map<String, Object>>(
                        Collections.singletonList(parentRow), 1, 1, 100));
        Map<String, Object> child = row("id", 101L, "cycleCaseId", 60L,
                "taskStatus", "COMPLETED",
                "executions", Collections.singletonList(row("id", 31L, "attemptNo", 2,
                        "runnerType", "NODE", "executionStatus", "COMPLETED",
                        "result", "FAIL", "actualResult", "assertion failed")));
        when(tasks.get(100L)).thenReturn(row("task", row("id", 100L, "taskType", "EXECUTE_CYCLE"),
                "children", Collections.singletonList(child)));

        TestReportService service = new TestReportService(cycles, tasks, new ObjectMapper());
        String html = service.generateHtml(6L);

        assertTrue(html.contains("LEGACY-DEV"));
        assertTrue(html.contains("TC-CHILD"));
        assertTrue(html.contains("NODE"));
        assertTrue(html.contains("失败"));
        assertTrue(html.contains("assertion failed"));
    }

    private Map<String, Object> row(Object... values) {
        Map<String, Object> result = new LinkedHashMap<String, Object>();
        for (int i = 0; i < values.length; i += 2) result.put(String.valueOf(values[i]), values[i + 1]);
        return result;
    }
}
