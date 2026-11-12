package com.devprocess.manager.testreport.service;

import com.devprocess.manager.common.web.PageResult;
import com.devprocess.manager.execution.service.ExecutionTaskService;
import com.devprocess.manager.testcycle.dto.TestCycleCaseDTO;
import com.devprocess.manager.testcycle.dto.TestCycleDTO;
import com.devprocess.manager.testcycle.service.TestCycleService;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class TestReportCsvServiceTest {
    private static Map<String, Object> row(Object... pairs) {
        Map<String, Object> map = new HashMap<String, Object>();
        for (int i = 0; i < pairs.length; i += 2) {
            map.put((String) pairs[i], pairs[i + 1]);
        }
        return map;
    }

    @Test
    void exportUsesOneRowPerCaseAndLatestExecutionWithoutSecrets() {
        TestCycleService cycles = mock(TestCycleService.class);
        ExecutionTaskService tasks = mock(ExecutionTaskService.class);
        TestCycleDTO cycle = new TestCycleDTO();
        cycle.setId(4L);
        cycle.setProjectName("本地测试");
        cycle.setVersionNo("1.0");
        cycle.setCycleName("回归测试");
        cycle.setStatus("COMPLETED");
        cycle.setEnvironmentName("测试环境");
        TestCycleCaseDTO first = new TestCycleCaseDTO();
        first.setId(33L);
        first.setCaseNo("=SUM(1,2)");
        first.setTitle("登录,\r\npassword=SECRET-TITLE");
        first.setExecutionMode("AUTO");
        first.setExecutionStatus("COMPLETED");
        first.setLatestResult("PASS");
        TestCycleCaseDTO second = new TestCycleCaseDTO();
        second.setId(34L);
        second.setCaseNo("TC-2");
        second.setTitle("无执行记录");
        second.setExecutionMode("AI");
        second.setExecutionStatus("NOT_RUN");
        cycle.setCases(Arrays.asList(first, second));
        when(cycles.get(4L)).thenReturn(cycle);

        when(tasks.page(null, 4L, null, 1, 100)).thenReturn(
                new PageResult<Map<String, Object>>(
                        Collections.singletonList(row("id", 99L, "parentTaskId", null)), 1, 1, 100));
        when(tasks.get(99L)).thenReturn(row(
                "task", row("id", 99L, "cycleCaseId", 33L, "taskStatus", "COMPLETED"),
                "executions", Arrays.asList(
                        row("id", 17L, "attemptNo", 1, "runnerType", "HTTP",
                                "executionStatus", "INTERRUPTED",
                                "logExcerpt", "Bearer SECRET-LOG",
                                "requestSnapshotJson", "{\"token\":\"SECRET-SNAPSHOT\"}"),
                        row("id", 18L, "attemptNo", 2, "runnerType", "CHATGPT",
                                "executionStatus", "COMPLETED",
                                "eventContent", "password=SECRET-EVENT"))));
        String csv = new TestReportService(cycles, tasks, new ObjectMapper()).generateCsv(4L);

        assertTrue(csv.startsWith("\uFEFF\"项目\""));
        assertTrue(csv.endsWith("\r\n"));
        assertEquals(3, csv.split("\r\n").length);
        assertTrue(csv.contains("\"'=SUM(1,2)\""));
        assertTrue(csv.contains("password=[REDACTED]"));
        assertTrue(csv.contains("\"2\",\"18\",\"CHATGPT\",\"COMPLETED\""));
        assertTrue(csv.contains("\"TC-2\""));
        for (String forbidden : Arrays.asList("SECRET-TITLE", "SECRET-LOG",
                "SECRET-SNAPSHOT", "SECRET-EVENT", "requestSnapshotJson", "logExcerpt")) {
            assertFalse(csv.contains(forbidden), "CSV leaked: " + forbidden);
        }
        verify(tasks).get(99L);
    }

    @Test
    void exportEmptyCycleOnlyHasHeaderAndNoTaskDetails() {
        TestCycleService cycles = mock(TestCycleService.class);
        ExecutionTaskService tasks = mock(ExecutionTaskService.class);
        TestCycleDTO cycle = new TestCycleDTO();
        cycle.setCases(new ArrayList<TestCycleCaseDTO>());
        when(cycles.get(9L)).thenReturn(cycle);
        when(tasks.page(null, 9L, null, 1, 100)).thenReturn(
                new PageResult<Map<String, Object>>(
                        Collections.<Map<String, Object>>emptyList(), 0, 1, 100));
        String csv = new TestReportService(cycles, tasks, new ObjectMapper()).generateCsv(9L);
        assertTrue(csv.startsWith("\uFEFF\"项目\",\"版本\""));
        assertEquals(1, csv.split("\r\n").length);
        verify(tasks, never()).get(anyLong());
    }


    @Test
    @SuppressWarnings("unchecked")
    void reviewReturnsOnlyCaseMetadataAndLatestAttempt() throws Exception {
        TestCycleService cycles = mock(TestCycleService.class);
        ExecutionTaskService tasks = mock(ExecutionTaskService.class);
        TestCycleDTO cycle = new TestCycleDTO();
        cycle.setId(45L);
        cycle.setCycleName("失败用例核对");
        cycle.setStatus("COMPLETED");
        TestCycleCaseDTO failed = new TestCycleCaseDTO();
        failed.setId(33L);
        failed.setCaseNo("TC-FAIL");
        failed.setTitle("password=SECRET-CASE");
        failed.setExecutionMode("AUTO");
        failed.setExecutionStatus("COMPLETED");
        failed.setLatestResult("FAIL");
        TestCycleCaseDTO notRun = new TestCycleCaseDTO();
        notRun.setId(34L);
        notRun.setCaseNo("TC-PENDING");
        notRun.setTitle("等待执行");
        notRun.setExecutionMode("AI");
        cycle.setCases(Arrays.asList(failed, notRun));
        when(cycles.get(45L)).thenReturn(cycle);
        when(tasks.page(null, 45L, null, 1, 100)).thenReturn(
                new PageResult<Map<String, Object>>(
                        Collections.singletonList(row("id", 99L)), 1, 1, 100));
        when(tasks.get(99L)).thenReturn(row(
                "task", row("id", 99L, "cycleCaseId", 33L),
                "executions", Arrays.asList(
                        row("id", 11L, "runnerType", "HTTP", "executionStatus", "INTERRUPTED",
                                "logExcerpt", "SECRET-LOG"),
                        row("id", 18L, "runnerType", "BROWSER", "executionStatus", "COMPLETED",
                                "requestSnapshotJson", "SECRET-SNAPSHOT"))));
        Map<String, Object> review = new TestReportService(cycles, tasks, new ObjectMapper()).review(45L);
        assertEquals(2, review.get("total"));
        Map<String, Integer> counts = (Map<String, Integer>) review.get("counts");
        assertEquals(1, counts.get("FAIL"));
        assertEquals(1, counts.get("NOT_RUN"));
        List<Map<String, Object>> rows = (List<Map<String, Object>>) review.get("rows");
        assertEquals(99L, rows.get(0).get("taskId"));
        assertEquals(18L, rows.get(0).get("executionId"));
        assertEquals(2, rows.get(0).get("attemptCount"));
        assertEquals("BROWSER", rows.get(0).get("runnerType"));
        assertEquals("password=[REDACTED]", rows.get(0).get("title"));
        assertNull(rows.get(1).get("taskId"));
        assertEquals(0, rows.get(1).get("attemptCount"));
        String json = new ObjectMapper().writeValueAsString(review);
        for (String forbidden : Arrays.asList("SECRET-CASE", "SECRET-LOG", "SECRET-SNAPSHOT",
                "requestSnapshotJson", "logExcerpt", "eventContent", "checkpointJson")) {
            assertFalse(json.contains(forbidden), "Review leaked: " + forbidden);
        }
    }

}
