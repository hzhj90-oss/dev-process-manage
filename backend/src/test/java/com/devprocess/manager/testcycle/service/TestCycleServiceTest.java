package com.devprocess.manager.testcycle.service;

import com.devprocess.manager.common.exception.BusinessException;
import com.devprocess.manager.environment.mapper.EnvironmentMapper;
import com.devprocess.manager.execution.service.ExecutionTaskService;
import com.devprocess.manager.testcase.mapper.TestCaseMapper;
import com.devprocess.manager.testcycle.dto.TestCycleDTO;
import com.devprocess.manager.testcycle.mapper.TestCycleMapper;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.mockito.InOrder;

import java.util.Collections;
import java.util.HashMap;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class TestCycleServiceTest {

    @Test
    void previousCompletedMustStayWithinVersionAndOnlyQueryForLaterRounds() {
        TestCycleMapper mapper = mock(TestCycleMapper.class);
        TestCycleService service = new TestCycleService(mapper,
                mock(TestCaseMapper.class), mock(EnvironmentMapper.class),
                mock(ExecutionTaskService.class), new ObjectMapper());
        TestCycleDTO current = new TestCycleDTO();
        current.setId(23L);
        current.setVersionId(6L);
        current.setCycleNo(3);
        when(mapper.selectPreviousCompletedCycleId(6L, 3)).thenReturn(22L);
        TestCycleDTO previous = new TestCycleDTO();
        previous.setId(22L);
        previous.setVersionId(6L);
        previous.setCycleNo(2);
        previous.setStatus("COMPLETED");
        when(mapper.selectById(22L)).thenReturn(previous);
        when(mapper.selectCases(22L)).thenReturn(Collections.emptyList());
        assertEquals(22L, service.previousCompleted(current).getId());
        verify(mapper).selectPreviousCompletedCycleId(6L, 3);

        current.setCycleNo(1);
        assertNull(service.previousCompleted(current));
        current.setVersionId(null);
        assertNull(service.previousCompleted(current));
        assertNull(service.previousCompleted(null));
        verify(mapper, never()).selectPreviousCompletedCycleId(6L, 1);
    }

    @Test
    @SuppressWarnings("unchecked")
    void diagnosticIsBoundedReadOnlyAndClassifiesRootTasksWithoutRawPayloads() {
        TestCycleMapper mapper = mock(TestCycleMapper.class);
        TestCycleService service = new TestCycleService(mapper,
                mock(TestCaseMapper.class), mock(EnvironmentMapper.class),
                mock(ExecutionTaskService.class), new ObjectMapper());
        assertEquals(400, assertThrows(BusinessException.class,
                () -> service.statusDiagnostics(0)).getStatus());
        assertEquals(400, assertThrows(BusinessException.class,
                () -> service.statusDiagnostics(201)).getStatus());
        verify(mapper, never()).selectStatusDiagnostics(anyInt());

        java.util.Map<String, Object> active = new HashMap<String, Object>();
        active.put("cycleId", 30L);
        active.put("cycleName", "historical running cycle");
        active.put("caseCount", 2L);
        active.put("activeRootTasks", 1L);
        active.put("rootTaskCount", 2L);
        active.put("requestSnapshotJson", "SECRET_PAYLOAD");
        java.util.Map<String, Object> done = new HashMap<String, Object>();
        done.put("cycleId", 29L);
        done.put("rootTaskCount", 1L);
        done.put("activeRootTasks", 0L);
        java.util.Map<String, Object> extra = new HashMap<String, Object>();
        extra.put("cycleId", 28L);
        when(mapper.selectStatusDiagnostics(3)).thenReturn(
                java.util.Arrays.asList(active, done, extra));

        Map<String, Object> result = service.statusDiagnostics(2);
        assertEquals(true, result.get("readOnly"));
        assertEquals(true, result.get("truncated"));
        assertEquals(2, result.get("count"));
        assertEquals(1, result.get("activeRootCycles"));
        assertEquals(1, result.get("noActiveRootCycles"));
        assertEquals(0, result.get("noRootTaskCycles"));
        java.util.List<java.util.Map<String, Object>> rows =
                (java.util.List<java.util.Map<String, Object>>) result.get("items");
        assertEquals("ACTIVE_ROOT_TASK", rows.get(0).get("diagnosticCategory"));
        assertEquals("NO_ACTIVE_ROOT_TASK", rows.get(1).get("diagnosticCategory"));
        assertFalse(rows.get(0).containsKey("requestSnapshotJson"));
        verify(mapper).selectStatusDiagnostics(3);
        verify(mapper, never()).updateStatus(anyLong(), anyString(), anyBoolean(), anyBoolean());
    }

    @Test
    void startMustRejectStatusUpdateThatAffectedNoRow() {
        TestCycleMapper mapper = mock(TestCycleMapper.class);
        when(mapper.selectCycleForUpdate(1L)).thenReturn(
                Collections.<String, Object>singletonMap("status", "PLANNED"));
        when(mapper.selectCaseCount(1L)).thenReturn(1);
        when(mapper.updateStatus(1L, "RUNNING", true, false)).thenReturn(0);
        TestCycleService service = new TestCycleService(mapper,
                mock(TestCaseMapper.class), mock(EnvironmentMapper.class),
                mock(ExecutionTaskService.class), new ObjectMapper());

        BusinessException error = assertThrows(BusinessException.class,
                () -> service.start(1L));

        assertEquals(409, error.getStatus());
        verify(mapper, never()).selectById(1L);
    }

    @Test
    void startMustNotUpdateStatusWithoutCycleCases() {
        TestCycleMapper mapper = mock(TestCycleMapper.class);
        when(mapper.selectCycleForUpdate(1L)).thenReturn(
                Collections.<String, Object>singletonMap("status", "PLANNED"));
        when(mapper.selectCaseCount(1L)).thenReturn(0);
        TestCycleService service = new TestCycleService(mapper,
                mock(TestCaseMapper.class), mock(EnvironmentMapper.class),
                mock(ExecutionTaskService.class), new ObjectMapper());

        BusinessException error = assertThrows(BusinessException.class,
                () -> service.start(1L));

        assertEquals(400, error.getStatus());
        verify(mapper, never()).updateStatus(anyLong(), anyString(), anyBoolean(), anyBoolean());
    }

    @Test
    void abortMustCancelActiveTasksAfterMarkingCycleAborted() {
        TestCycleMapper mapper = mock(TestCycleMapper.class);
        TestCaseMapper testCaseMapper = mock(TestCaseMapper.class);
        EnvironmentMapper environmentMapper = mock(EnvironmentMapper.class);
        ExecutionTaskService executionTaskService = mock(ExecutionTaskService.class);
        Map<String, Object> current = new HashMap<String, Object>();
        current.put("status", "RUNNING");
        when(mapper.selectCycleForUpdate(1L)).thenReturn(current);
        when(mapper.updateStatus(1L, "ABORTED", false, true)).thenReturn(1);
        when(mapper.selectById(1L)).thenReturn(new TestCycleDTO());
        when(mapper.selectCases(1L)).thenReturn(Collections.emptyList());

        TestCycleService service = new TestCycleService(mapper, testCaseMapper,
                environmentMapper, executionTaskService, new ObjectMapper());

        TestCycleDTO result = service.abort(1L);

        assertNotNull(result);
        InOrder order = inOrder(mapper, executionTaskService);
        order.verify(mapper).selectCycleForUpdate(1L);
        order.verify(mapper).updateStatus(1L, "ABORTED", false, true);
        order.verify(executionTaskService).cancelActiveTasksForAbortedCycle(
                1L, "测试轮次已终止", "system");
    }
}
