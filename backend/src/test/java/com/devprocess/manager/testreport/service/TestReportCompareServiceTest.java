package com.devprocess.manager.testreport.service;

import com.devprocess.manager.execution.service.ExecutionTaskService;
import com.devprocess.manager.testcycle.dto.TestCycleCaseDTO;
import com.devprocess.manager.testcycle.dto.TestCycleDTO;
import com.devprocess.manager.testcycle.service.TestCycleService;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class TestReportCompareServiceTest {
    private static TestCycleDTO cycle(long id, long versionId, int no,
            String status, TestCycleCaseDTO... cases) {
        TestCycleDTO cycle = new TestCycleDTO();
        cycle.setId(id);
        cycle.setVersionId(versionId);
        cycle.setCycleNo(no);
        cycle.setCycleName("Round " + no);
        cycle.setStatus(status);
        cycle.setCases(Arrays.asList(cases));
        return cycle;
    }

    private static TestCycleCaseDTO c(long originalId, String number, String result) {
        TestCycleCaseDTO item = new TestCycleCaseDTO();
        item.setId(originalId + 5000);
        item.setTestCaseId(originalId);
        item.setCaseNo(number);
        item.setTitle("Case " + number);
        item.setLatestResult(result);
        return item;
    }

    @SuppressWarnings("unchecked")
    @Test
    void distinguishesFixedRegressionUnresolvedFirstPassAndScopeChangesByStableId() {
        TestCycleService service = mock(TestCycleService.class);
        ExecutionTaskService tasks = mock(ExecutionTaskService.class);
        TestCycleDTO prior = cycle(90L, 6L, 1, "COMPLETED",
                c(1, "OLD", "FAIL"), c(2, "CASE2", "PASS"),
                c(3, "CASE3", "FAIL"), c(4, "CASE4", "PASS"),
                c(5, "CASE5", "SKIPPED"), c(6, "CASE6", "PASS"),
                c(7, "REMOVED", "FAIL"));
        TestCycleDTO current = cycle(91L, 6L, 2, "COMPLETED",
                c(1, "RENAMED", "PASS"), c(2, "CASE2", "FAIL"),
                c(3, "CASE3", "BLOCKED"), c(4, "CASE4", "PASS"),
                c(5, "CASE5", "PASS"), c(6, "CASE6", "NOT_RUN"),
                c(8, "ADDED", "FAIL"));
        when(service.get(91L)).thenReturn(current);
        when(service.previousCompleted(current)).thenReturn(prior);
        Map<String,Object> result = new TestReportService(service,tasks,new ObjectMapper()).compare(91L);
        Map<String,Integer> counts = (Map<String,Integer>)result.get("counts");
        assertEquals(1, counts.get("FIXED"));
        assertEquals(1, counts.get("REGRESSION"));
        assertEquals(1, counts.get("STILL_FAIL"));
        assertEquals(1, counts.get("STILL_PASS"));
        assertEquals(1, counts.get("FIRST_PASS"));
        assertEquals(1, counts.get("CHANGED"));
        assertEquals(1, counts.get("NEW_CASE"));
        assertEquals(1, counts.get("REMOVED_CASE"));
        assertEquals(8, result.get("total"));
        assertEquals(90L,result.get("previousCycleId"));
        List<Map<String,Object>> rows = (List<Map<String,Object>>)result.get("rows");
        assertEquals("RENAMED", rows.get(0).get("caseNo"));
        assertEquals("FIXED", rows.get(0).get("change"));
        assertEquals("FAIL", rows.get(0).get("previousResult"));
        assertEquals("PASS", rows.get(0).get("currentResult"));
        assertEquals("REMOVED_CASE", rows.get(7).get("change"));
        verifyNoInteractions(tasks);
    }

    @SuppressWarnings("unchecked")
    @Test
    void firstCompletedCycleHasNoPreviousAndCannotFabricateImprovements() {
        TestCycleService service = mock(TestCycleService.class);
        ExecutionTaskService tasks = mock(ExecutionTaskService.class);
        TestCycleDTO only = cycle(91L, 6L, 1, "COMPLETED",c(1,"FIRST","PASS"));
        when(service.get(91L)).thenReturn(only);
        Map<String,Object> result = new TestReportService(service,tasks,new ObjectMapper()).compare(91L);
        assertNull(result.get("previousCycleId"));
        assertEquals(0,result.get("total"));
        assertTrue(((List<?>)result.get("rows")).isEmpty());
        assertEquals(0, ((Map<String,Integer>)result.get("counts")).get("FIXED"));
        verify(service).previousCompleted(only);
        verifyNoInteractions(tasks);
    }

    @Test
    void neverComparesAcrossVersionsOrToUnfinishedOrNewerRounds() {
        TestCycleService service = mock(TestCycleService.class);
        ExecutionTaskService tasks = mock(ExecutionTaskService.class);
        TestCycleDTO current = cycle(91L, 6L, 2, "COMPLETED",c(1,"A","PASS"));
        when(service.get(91L)).thenReturn(current);
        TestReportService report = new TestReportService(service,tasks,new ObjectMapper());
        for (TestCycleDTO wrong : Arrays.asList(
                cycle(90L,7L,1,"COMPLETED",c(1,"A","FAIL")),
                cycle(90L,6L,1,"RUNNING",c(1,"A","FAIL")),
                cycle(92L,6L,3,"COMPLETED",c(1,"A","FAIL")))) {
            when(service.previousCompleted(current)).thenReturn(wrong);
            assertThrows(IllegalStateException.class, () -> report.compare(91L));
        }
        verifyNoInteractions(tasks);
    }

    @Test
    void differentEnvironmentAndDeployedCodeAreExplicitlyFlaggedWithoutSecrets() {
        TestCycleService service = mock(TestCycleService.class);
        TestCycleDTO previous = cycle(90L, 6L, 1, "COMPLETED", c(1,"A","FAIL"));
        previous.setEnvironmentId(8L);
        previous.setEnvironmentName("test3");
        previous.setCodeVersion("build-A");
        previous.setGitCommit("aaaaaaa");
        TestCycleDTO current = cycle(91L, 6L, 2, "COMPLETED", c(1,"A","PASS"));
        current.setEnvironmentId(9L);
        current.setEnvironmentName("pre-release");
        current.setCodeVersion("build-B");
        current.setGitCommit("bbbbbbb");
        when(service.get(91L)).thenReturn(current);
        when(service.previousCompleted(current)).thenReturn(previous);
        Map<String,Object> report = new TestReportService(service,
                mock(ExecutionTaskService.class),new ObjectMapper()).compare(91L);
        assertEquals(Boolean.TRUE, report.get("environmentChanged"));
        assertEquals(Boolean.TRUE, report.get("codeVersionChanged"));
        assertEquals("test3", report.get("previousEnvironmentName"));
        assertEquals("pre-release", report.get("environmentName"));
        assertEquals("build-A", report.get("previousCodeVersion"));
        assertEquals("build-B", report.get("codeVersion"));
        assertFalse(report.containsKey("environmentSnapshotJson"));
    }

    @Test
    void missingEnvironmentOrCodeIdentityStaysUnknownRatherThanAssumedEqual() {
        TestCycleService service = mock(TestCycleService.class);
        TestCycleDTO previous = cycle(90L, 6L, 1, "COMPLETED", c(1,"A","FAIL"));
        TestCycleDTO current = cycle(91L, 6L, 2, "COMPLETED", c(1,"A","PASS"));
        when(service.get(91L)).thenReturn(current);
        when(service.previousCompleted(current)).thenReturn(previous);
        Map<String,Object> unknown = new TestReportService(service,
                mock(ExecutionTaskService.class),new ObjectMapper()).compare(91L);
        assertNull(unknown.get("environmentChanged"));
        assertNull(unknown.get("codeVersionChanged"));
        previous.setEnvironmentId(9L);
        current.setEnvironmentId(9L);
        previous.setCodeVersion("release-1");
        current.setCodeVersion("release-1");
        Map<String,Object> matched = new TestReportService(service,
                mock(ExecutionTaskService.class),new ObjectMapper()).compare(91L);
        assertEquals(Boolean.FALSE, matched.get("environmentChanged"));
        assertEquals(Boolean.FALSE, matched.get("codeVersionChanged"));
    }

    @Test
    void duplicateOriginalTestCaseIdRefusesMisleadingComparison() {
        TestCycleService service = mock(TestCycleService.class);
        ExecutionTaskService tasks = mock(ExecutionTaskService.class);
        TestCycleDTO prior = cycle(90L,6L,1,"COMPLETED",c(1,"ONE","FAIL"));
        TestCycleDTO now = cycle(91L,6L,2,"COMPLETED",
                c(1,"ONE","PASS"),c(1,"ONE-AGAIN","PASS"));
        when(service.get(91L)).thenReturn(now);
        when(service.previousCompleted(now)).thenReturn(prior);
        assertThrows(IllegalStateException.class,
                () -> new TestReportService(service,tasks,new ObjectMapper()).compare(91L));
    }
}
