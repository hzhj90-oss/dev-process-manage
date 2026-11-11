package com.devprocess.manager.execution.service;

import com.devprocess.manager.common.exception.BusinessException;
import com.devprocess.manager.execution.dto.ExecutionCompleteRequest;
import com.devprocess.manager.execution.dto.RunnerClaimRequest;
import com.devprocess.manager.execution.mapper.ExecutionTaskMapper;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.InOrder;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.Collections;
import java.util.HashMap;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class RunnerServiceTest {
    private ExecutionTaskMapper mapper;
    private RunnerService service;

    @BeforeEach
    void setUp() {
        mapper = mock(ExecutionTaskMapper.class);
        service = new RunnerService(mapper, new ObjectMapper());
        ReflectionTestUtils.setField(service, "sharedToken", "local-runner-shared-token-for-tests");
        ReflectionTestUtils.setField(service, "configuredLeaseSeconds", 60);
    }

    @Test
    void claimMustFilterNodeRunnerTasksByRequestedType() {
        when(mapper.selectClaimableTasks("NODE", 1)).thenReturn(Collections.emptyList());

        RunnerClaimRequest request = new RunnerClaimRequest();
        request.setRunnerId("node-runner-test");
        request.setRunnerType("NODE");

        Map<String, Object> result = service.claim("local-runner-shared-token-for-tests", request);

        assertEquals(Boolean.FALSE, result.get("claimed"));
        verify(mapper).selectClaimableTasks("NODE", 1);
        verifyNoMoreInteractions(mapper);
    }

    @Test
    void claimMustDefaultToHttpForExistingRunnerClients() {
        when(mapper.selectClaimableTasks("HTTP", 1)).thenReturn(Collections.emptyList());

        RunnerClaimRequest request = new RunnerClaimRequest();
        request.setRunnerId("http-runner-test");
        request.setRunnerType(null);

        Map<String, Object> result = service.claim("local-runner-shared-token-for-tests", request);

        assertEquals(Boolean.FALSE, result.get("claimed"));
        verify(mapper).selectClaimableTasks("HTTP", 1);
    }

    @Test
    void claimMustRejectUnsupportedRunnerTypes() {
        RunnerClaimRequest request = new RunnerClaimRequest();
        request.setRunnerId("python-runner-test");
        request.setRunnerType("PYTHON");

        BusinessException exception = assertThrows(BusinessException.class,
                () -> service.claim("local-runner-shared-token-for-tests", request));

        assertEquals(400, exception.getStatus());
        verifyNoInteractions(mapper);
    }

    @Test
    void claimMustSkipCandidateWhenCycleWasAbortedAfterQueueDiscovery() {
        Map<String, Object> candidate = new HashMap<String, Object>();
        candidate.put("id", 5L);
        when(mapper.selectClaimableTasks("NODE", 1))
                .thenReturn(Collections.singletonList(candidate));
        when(mapper.selectCycleIdByTaskId(5L)).thenReturn(70L);
        when(mapper.selectCycleForUpdate(70L))
                .thenReturn(Collections.<String, Object>singletonMap("status", "ABORTED"));

        RunnerClaimRequest request = new RunnerClaimRequest();
        request.setRunnerId("node-runner-test");
        request.setRunnerType("NODE");

        Map<String, Object> result = service.claim("local-runner-shared-token-for-tests", request);

        assertEquals(Boolean.FALSE, result.get("claimed"));
        verify(mapper).selectCycleIdByTaskId(5L);
        verify(mapper).selectCycleForUpdate(70L);
        verify(mapper, never()).selectParentTaskId(5L);
        verify(mapper, never()).updateTaskClaimed(eq(5L), anyString(), anyString(), anyInt());
    }

    @Test
    void heartbeatMustAcceptNodeExecutionWithAValidLease() {
        Map<String, Object> task = new HashMap<String, Object>();
        task.put("taskStatus", "RUNNING");
        task.put("cycleCaseId", 7L);
        Map<String, Object> execution = new HashMap<String, Object>();
        execution.put("id", 11L);
        execution.put("executionStatus", "RUNNING");
        execution.put("runnerType", "NODE");

        when(mapper.selectCycleIdByTaskId(5L)).thenReturn(70L);
        when(mapper.selectCycleForUpdate(70L))
                .thenReturn(Collections.<String, Object>singletonMap("status", "RUNNING"));
        when(mapper.selectParentTaskId(5L)).thenReturn(null);
        when(mapper.selectTaskForUpdate(5L)).thenReturn(task);
        when(mapper.selectLatestExecutionForUpdate(5L)).thenReturn(execution);
        when(mapper.updateTaskLeaseHeartbeat(eq(5L), eq("node-runner-test"), anyString(), eq(60)))
                .thenReturn(1);

        Map<String, Object> result = service.heartbeat(
                5L, "node-runner-test", "node-runner-lease-token-for-tests-0001");

        assertEquals(Boolean.TRUE, result.get("ok"));
        verify(mapper).updateTaskLeaseHeartbeat(eq(5L), eq("node-runner-test"), anyString(), eq(60));
    }

    @Test
    void heartbeatMustRejectExpiredLeaseWhenConditionalRenewalFails() {
        Map<String, Object> task = new HashMap<String, Object>();
        task.put("taskStatus", "RUNNING");
        task.put("cycleCaseId", 7L);
        Map<String, Object> execution = new HashMap<String, Object>();
        execution.put("id", 11L);
        execution.put("executionStatus", "RUNNING");
        execution.put("runnerType", "NODE");

        when(mapper.selectCycleIdByTaskId(5L)).thenReturn(70L);
        when(mapper.selectCycleForUpdate(70L))
                .thenReturn(Collections.<String, Object>singletonMap("status", "RUNNING"));
        when(mapper.selectParentTaskId(5L)).thenReturn(null);
        when(mapper.selectTaskForUpdate(5L)).thenReturn(task);
        when(mapper.selectLatestExecutionForUpdate(5L)).thenReturn(execution);
        when(mapper.updateTaskLeaseHeartbeat(eq(5L), eq("node-runner-test"), anyString(), eq(60)))
                .thenReturn(0);

        BusinessException exception = assertThrows(BusinessException.class,
                () -> service.heartbeat(5L, "node-runner-test",
                        "node-runner-lease-token-for-tests-0001"));

        assertEquals(409, exception.getStatus());
        verify(mapper).updateTaskLeaseHeartbeat(eq(5L), eq("node-runner-test"), anyString(), eq(60));
    }

    @Test
    void runnerHeartbeatAndCompletionMustBeRejectedAfterCycleAbort() {
        when(mapper.selectCycleIdByTaskId(5L)).thenReturn(70L);
        when(mapper.selectCycleForUpdate(70L))
                .thenReturn(Collections.<String, Object>singletonMap("status", "ABORTED"));
        when(mapper.selectParentTaskId(5L)).thenReturn(null);
        when(mapper.selectTaskForUpdate(5L)).thenReturn(
                Collections.<String, Object>singletonMap("taskStatus", "CANCELLED"));

        String leaseToken = "node-runner-lease-token-for-tests-0001";
        BusinessException heartbeatException = assertThrows(BusinessException.class,
                () -> service.heartbeat(5L, "node-runner-test", leaseToken));
        ExecutionCompleteRequest request = new ExecutionCompleteRequest();
        request.setResult("PASS");
        BusinessException completionException = assertThrows(BusinessException.class,
                () -> service.complete(5L, "node-runner-test", leaseToken, request));

        assertEquals(409, heartbeatException.getStatus());
        assertEquals(409, completionException.getStatus());
        verify(mapper, never()).selectParentTaskId(5L);
        verify(mapper, never()).selectTaskForUpdate(5L);
        verify(mapper, never()).updateTaskLeaseHeartbeat(anyLong(), anyString(), anyString(), anyInt());
        verify(mapper, never()).updateExecutionCompleted(anyLong(), anyString(),
                anyString(), anyString(), anyString());
    }

    @Test
    void completeMustRefreshCycleStatusAfterTheLastRunnerCaseCompletes() {
        Map<String, Object> task = new HashMap<String, Object>();
        task.put("taskStatus", "RUNNING");
        task.put("cycleCaseId", 7L);
        Map<String, Object> execution = new HashMap<String, Object>();
        execution.put("id", 11L);
        execution.put("executionStatus", "RUNNING");
        execution.put("runnerType", "NODE");

        when(mapper.selectCycleIdByTaskId(5L)).thenReturn(70L);
        when(mapper.selectCycleForUpdate(70L))
                .thenReturn(Collections.<String, Object>singletonMap("status", "RUNNING"));
        when(mapper.selectParentTaskId(5L)).thenReturn(null);
        when(mapper.selectTaskForUpdate(5L)).thenReturn(task);
        when(mapper.selectLatestExecutionForUpdate(5L)).thenReturn(execution);
        when(mapper.updateTaskLeaseHeartbeat(eq(5L), eq("node-runner-test"), anyString(), eq(60)))
                .thenReturn(1);
        when(mapper.updateExecutionCompleted(11L, "PASS", null, null, null)).thenReturn(1);
        when(mapper.updateTaskCompleted(5L)).thenReturn(1);

        ExecutionCompleteRequest request = new ExecutionCompleteRequest();
        request.setResult("PASS");
        Map<String, Object> result = service.complete(5L, "node-runner-test",
                "node-runner-lease-token-for-tests-0001", request);

        assertEquals(Boolean.TRUE, result.get("ok"));
        InOrder order = inOrder(mapper);
        order.verify(mapper).selectCycleIdByTaskId(5L);
        order.verify(mapper).selectCycleForUpdate(70L);
        order.verify(mapper).selectParentTaskId(5L);
        order.verify(mapper).selectTaskForUpdate(5L);
        order.verify(mapper).selectLatestExecutionForUpdate(5L);
        order.verify(mapper).updateTaskLeaseHeartbeat(eq(5L), eq("node-runner-test"), anyString(), eq(60));
        order.verify(mapper).updateCycleCase(7L, "COMPLETED", "PASS");
        order.verify(mapper).completeCycleIfAllCasesTerminal(70L);
    }

    @Test
    void claimMustRejectAnInvalidSharedTokenBeforeReadingTasks() {
        RunnerClaimRequest request = new RunnerClaimRequest();
        request.setRunnerId("node-runner-test");
        request.setRunnerType("NODE");

        BusinessException exception = assertThrows(BusinessException.class,
                () -> service.claim("wrong-token", request));

        assertEquals(401, exception.getStatus());
        verifyNoInteractions(mapper);
    }
}
