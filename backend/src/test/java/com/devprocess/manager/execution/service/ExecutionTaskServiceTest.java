package com.devprocess.manager.execution.service;

import com.devprocess.manager.common.exception.BusinessException;
import com.devprocess.manager.execution.dto.ExecutionEventInsertDTO;
import com.devprocess.manager.execution.dto.ExecutionCompleteRequest;
import com.devprocess.manager.execution.dto.ExecutionTaskCreateRequest;
import com.devprocess.manager.execution.dto.ExecutionTaskStartRequest;
import com.devprocess.manager.execution.mapper.ExecutionTaskMapper;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import org.mockito.InOrder;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class ExecutionTaskServiceTest {
    private ObjectMapper objectMapper;
    private ExecutionTaskMapper mapper;
    private ExecutionTaskService service;

    @BeforeEach
    void setUp() {
        objectMapper = new ObjectMapper();
        mapper = mock(ExecutionTaskMapper.class);
        service = new ExecutionTaskService(mapper, objectMapper);
    }

    @Test
    void sanitizeJsonMustRedactNestedSerializedEnvironmentConfig() throws Exception {
        ObjectNode nested = objectMapper.createObjectNode();
        nested.put("accessToken", "secret");
        nested.put("timeoutMs", 15000);
        ObjectNode source = objectMapper.createObjectNode();
        source.put("authorization", "Bearer abc");
        source.putObject("environment").put("configJson", objectMapper.writeValueAsString(nested));

        String json = objectMapper.writeValueAsString(source);
        String sanitized = ReflectionTestUtils.invokeMethod(service, "sanitizeJson", json);
        JsonNode result = objectMapper.readTree(sanitized);
        assertEquals("[REDACTED]", result.path("authorization").asText());

        JsonNode config = objectMapper.readTree(
                result.path("environment").path("configJson").asText());
        assertEquals("[REDACTED]", config.path("accessToken").asText());
        assertEquals(15000, config.path("timeoutMs").asInt());
    }

    @Test
    void eventMetadataAndContentMustBeSanitized() {
        ExecutionEventInsertDTO event = ReflectionTestUtils.invokeMethod(service, "event",
                1L, "LOG", "accessToken=abc", "password=abc", null, "clientSecret=xyz");
        assertTrue(event.getEventKey().contains("[REDACTED]"));
        assertTrue(event.getEventContent().contains("[REDACTED]"));
        assertTrue(event.getCreatedBy().contains("[REDACTED]"));
    }

    @Test
    void idempotencyKeyLongerThanColumnLimitMustBeRejected() {
        StringBuilder key = new StringBuilder();
        for (int i = 0; i < 65; i++) key.append('x');
        ExecutionTaskCreateRequest request = new ExecutionTaskCreateRequest();
        request.setIdempotencyKey(key.toString());
        BusinessException exception = assertThrows(BusinessException.class,
                () -> ReflectionTestUtils.invokeMethod(service, "normalizeCreateRequest", request));
        assertEquals(400, exception.getStatus());
    }

    @Test
    void startMustRejectExecutionAfterCycleAbortBeforeLockingTaskRows() {
        when(mapper.selectCycleIdByTaskId(7L)).thenReturn(70L);
        when(mapper.selectCycleForUpdate(70L)).thenReturn(row("status", "ABORTED"));
        ExecutionTaskStartRequest request = new ExecutionTaskStartRequest();
        request.setActor("CHATGPT");

        BusinessException exception = assertThrows(BusinessException.class,
                () -> service.start(7L, 700L, request));

        assertEquals(409, exception.getStatus());
        InOrder order = inOrder(mapper);
        order.verify(mapper).selectCycleIdByTaskId(7L);
        order.verify(mapper).selectCycleForUpdate(70L);
        verify(mapper, never()).selectParentTaskId(7L);
        verify(mapper, never()).updateTaskStarted(eq(7L), anyString());
    }

    @Test
    void abortCycleMustCancelPendingStandaloneTasks() {
        when(mapper.selectCycleForUpdate(70L)).thenReturn(row("status", "ABORTED"));
        when(mapper.selectCycleIdByTaskId(7L)).thenReturn(70L);
        when(mapper.selectActiveCycleRootTaskIds(70L)).thenReturn(Collections.singletonList(7L));
        when(mapper.selectParentTaskId(7L)).thenReturn(null);
        when(mapper.selectTaskForUpdate(7L)).thenReturn(row(
                "id", 7L, "taskType", "EXECUTE_CASE", "taskStatus", "PENDING", "cycleCaseId", 700L));
        when(mapper.selectLatestExecutionForUpdate(7L)).thenReturn(null);
        when(mapper.updateTaskCancelled(7L)).thenReturn(1);

        int cancelled = service.cancelActiveTasksForAbortedCycle(70L, "cycle aborted", "system");

        assertEquals(1, cancelled);
        InOrder order = inOrder(mapper);
        order.verify(mapper).selectCycleForUpdate(70L);
        order.verify(mapper).selectActiveCycleRootTaskIds(70L);
        order.verify(mapper).selectParentTaskId(7L);
        order.verify(mapper).selectTaskForUpdate(7L);
        verify(mapper).updateTaskCancelled(7L);
        verify(mapper).updateCycleCase(700L, "CANCELLED", null);
    }

    @Test
    void abortCycleMustPreserveCompletedChildrenAndCancelOnlyActiveChildren() {
        when(mapper.selectCycleForUpdate(70L)).thenReturn(row("status", "ABORTED"));
        when(mapper.selectCycleIdByTaskId(7L)).thenReturn(70L);
        when(mapper.selectActiveCycleRootTaskIds(70L)).thenReturn(Collections.singletonList(7L));
        when(mapper.selectParentTaskId(7L)).thenReturn(null);
        when(mapper.selectTaskForUpdate(7L)).thenReturn(row(
                "id", 7L, "taskType", "EXECUTE_CYCLE", "taskStatus", "RUNNING"));
        Map<String, Object> completedChild = row(
                "id", 8L, "taskStatus", "COMPLETED", "cycleCaseId", 800L);
        Map<String, Object> runningChild = row(
                "id", 9L, "taskStatus", "RUNNING", "cycleCaseId", 900L);
        when(mapper.selectChildTasksForUpdate(7L))
                .thenReturn(java.util.Arrays.asList(completedChild, runningChild));
        when(mapper.selectLatestExecutionForUpdate(9L))
                .thenReturn(row("id", 9000L, "executionStatus", "RUNNING"));
        when(mapper.updateExecutionCancelled(9000L, "cycle aborted")).thenReturn(1);
        when(mapper.updateTaskCancelled(9L)).thenReturn(1);
        when(mapper.updateTaskCancelled(7L)).thenReturn(1);

        int cancelled = service.cancelActiveTasksForAbortedCycle(70L, "cycle aborted", "system");

        assertEquals(1, cancelled);
        verify(mapper, never()).selectLatestExecutionForUpdate(8L);
        verify(mapper, never()).updateExecutionCancelled(eq(8000L), anyString());
        verify(mapper, never()).updateTaskCancelled(8L);
        verify(mapper).updateTaskCancelled(9L);
        verify(mapper).updateTaskCancelled(7L);
        verify(mapper).updateCycleCase(900L, "CANCELLED", null);
    }

    @SuppressWarnings("unchecked")
    @Test
    void chatGptQueueMustReturnPendingAiTaskWithParsedImmutableSnapshot() {
        when(mapper.selectChatGptClaimableTasks(10)).thenReturn(
                Collections.singletonList(row("id", 7L, "executionId", 700L)));
        when(mapper.selectTask(7L)).thenReturn(row(
                "id", 7L, "taskType", "EXECUTE_CASE", "taskStatus", "PENDING"));
        when(mapper.selectExecutions(7L)).thenReturn(Collections.singletonList(row(
                "id", 700L, "executionMode", "AI", "runnerType", "CHATGPT",
                "executionStatus", "QUEUED",
                "requestSnapshotJson", "{\"caseSnapshot\":{\"aiInstruction\":\"check health\"}}")));
        when(mapper.selectEvents(700L)).thenReturn(Collections.<Map<String, Object>>emptyList());

        List<Map<String, Object>> queue = service.chatGptQueue(10);

        assertEquals(1, queue.size());
        Map<String, Object> item = queue.get(0);
        Map<String, Object> execution = (Map<String, Object>) item.get("execution");
        JsonNode snapshot = (JsonNode) execution.get("requestSnapshot");
        assertEquals(7L, ((Map<String, Object>) item.get("task")).get("id"));
        assertEquals(700L, execution.get("id"));
        assertEquals("check health", snapshot.path("caseSnapshot").path("aiInstruction").asText());
        assertFalse(execution.containsKey("requestSnapshotJson"));
        verify(mapper).selectChatGptClaimableTasks(10);
    }

    @Test
    void chatGptQueueMustClampLimitAndSkipTasksClaimedConcurrently() {
        when(mapper.selectChatGptClaimableTasks(20)).thenReturn(
                Collections.singletonList(row("id", 7L, "executionId", 700L)));
        when(mapper.selectTask(7L)).thenReturn(row(
                "id", 7L, "taskType", "EXECUTE_CASE", "taskStatus", "RUNNING"));
        when(mapper.selectExecutions(7L)).thenReturn(Collections.<Map<String, Object>>emptyList());

        List<Map<String, Object>> queue = service.chatGptQueue(100);

        assertTrue(queue.isEmpty());
        verify(mapper).selectChatGptClaimableTasks(20);
    }

    @Test
    void recoveryMustNotInterruptExecutionWhenHeartbeatWasRefreshed() {
        stubRunningStaleCandidate();
        when(mapper.updateTaskRecoveryRequired(eq(7L), anyString())).thenReturn(0);

        int recovered = service.recoverStaleTasks();

        assertEquals(0, recovered);
        verify(mapper).updateTaskRecoveryRequired(eq(7L), anyString());
        verify(mapper, never()).updateExecutionInterrupted(eq(700L), anyString());
        verify(mapper, never()).insertEvent(any(ExecutionEventInsertDTO.class));
    }

    @Test
    void recoveryMustClaimTaskBeforeInterruptingExecution() {
        stubRunningStaleCandidate();
        when(mapper.updateTaskRecoveryRequired(eq(7L), anyString())).thenReturn(1);
        when(mapper.updateExecutionInterrupted(eq(700L), anyString())).thenReturn(1);

        int recovered = service.recoverStaleTasks();

        assertEquals(1, recovered);
        InOrder order = inOrder(mapper);
        order.verify(mapper).updateTaskRecoveryRequired(eq(7L), anyString());
        order.verify(mapper).updateExecutionInterrupted(eq(700L), anyString());
        verify(mapper).insertEvent(any(ExecutionEventInsertDTO.class));
    }

    @Test
    void recoveryMustFailWhenExecutionCannotBeInterruptedAfterTaskClaim() {
        stubRunningStaleCandidate();
        when(mapper.updateTaskRecoveryRequired(eq(7L), anyString())).thenReturn(1);
        when(mapper.updateExecutionInterrupted(eq(700L), anyString())).thenReturn(0);

        BusinessException exception = assertThrows(BusinessException.class,
                () -> service.recoverStaleTasks());

        assertEquals(409, exception.getStatus());
        verify(mapper, never()).insertEvent(any(ExecutionEventInsertDTO.class));
    }

    @Test
    void manualCompletionMustRefreshCycleAfterTheCaseBecomesTerminal() {
        when(mapper.selectCycleIdByTaskId(7L)).thenReturn(70L);
        when(mapper.selectCycleForUpdate(70L)).thenReturn(row("status", "RUNNING"));
        when(mapper.selectParentTaskId(7L)).thenReturn(null);
        when(mapper.selectTaskForUpdate(7L)).thenReturn(row(
                "id", 7L, "taskType", "EXECUTE_CASE", "taskStatus", "RUNNING", "cycleCaseId", 700L));
        when(mapper.selectExecutionForUpdate(7L, 7000L))
                .thenReturn(row("id", 7000L, "executionStatus", "RUNNING"));
        when(mapper.updateExecutionCompleted(7000L, "PASS", null, null, null)).thenReturn(1);
        when(mapper.updateTaskCompleted(7L)).thenReturn(1);
        when(mapper.selectTask(7L)).thenReturn(row("id", 7L, "taskType", "EXECUTE_CASE"));
        when(mapper.selectExecutions(7L)).thenReturn(Collections.<Map<String, Object>>emptyList());

        ExecutionCompleteRequest request = new ExecutionCompleteRequest();
        request.setResult("PASS");
        service.complete(7L, 7000L, request);

        InOrder order = inOrder(mapper);
        order.verify(mapper).selectCycleIdByTaskId(7L);
        order.verify(mapper).selectCycleForUpdate(70L);
        order.verify(mapper).selectParentTaskId(7L);
        order.verify(mapper).selectTaskForUpdate(7L);
        order.verify(mapper).updateCycleCase(700L, "COMPLETED", "PASS");
        order.verify(mapper).completeCycleIfAllCasesTerminal(70L);
    }

    private void stubRunningStaleCandidate() {
        when(mapper.selectStaleTasks()).thenReturn(
                Collections.singletonList(row("id", 7L)));
        when(mapper.selectCycleIdByTaskId(7L)).thenReturn(70L);
        when(mapper.selectCycleForUpdate(70L)).thenReturn(row("status", "RUNNING"));
        when(mapper.selectParentTaskId(7L)).thenReturn(null);
        when(mapper.selectTaskForUpdate(7L)).thenReturn(
                row("taskStatus", "RUNNING", "cycleCaseId", 70L));
        when(mapper.selectLatestExecutionForUpdate(7L)).thenReturn(
                row("id", 700L, "executionStatus", "RUNNING"));
    }

    private Map<String, Object> row(Object... pairs) {
        Map<String, Object> values = new HashMap<String, Object>();
        for (int i = 0; i < pairs.length; i += 2) {
            values.put(String.valueOf(pairs[i]), pairs[i + 1]);
        }
        return values;
    }
}
