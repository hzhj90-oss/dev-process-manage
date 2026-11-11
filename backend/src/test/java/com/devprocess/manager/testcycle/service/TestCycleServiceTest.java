package com.devprocess.manager.testcycle.service;

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

import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class TestCycleServiceTest {
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
