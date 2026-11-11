package com.devprocess.manager.execution.mapper;

import com.devprocess.manager.execution.dto.ExecutionAttachmentInsertDTO;
import com.devprocess.manager.execution.dto.ExecutionEventInsertDTO;
import com.devprocess.manager.execution.dto.ExecutionInsertDTO;
import com.devprocess.manager.execution.dto.ExecutionTaskInsertDTO;
import org.apache.ibatis.annotations.Param;
import java.util.List;
import java.util.Map;

public interface ExecutionTaskMapper {
    List<Map<String,Object>> selectPage(@Param("status") String status, @Param("cycleId") Long cycleId,
        @Param("keyword") String keyword, @Param("offset") int offset, @Param("pageSize") int pageSize);
    long countPage(@Param("status") String status, @Param("cycleId") Long cycleId, @Param("keyword") String keyword);
    Map<String,Object> selectCycleForUpdate(@Param("cycleId") Long cycleId);
    Long selectCycleIdByTaskId(@Param("taskId") Long taskId);
    List<Long> selectActiveCycleRootTaskIds(@Param("cycleId") Long cycleId);
    Map<String,Object> selectTaskForUpdate(@Param("id") Long id);
    Map<String,Object> selectByIdempotencyKey(@Param("cycleId") Long cycleId, @Param("idempotencyKey") String key);
    List<Map<String,Object>> selectCycleCasesForUpdate(@Param("cycleId") Long cycleId, @Param("cycleCaseId") Long cycleCaseId);
    int countActiveCycleTasks(@Param("cycleId") Long cycleId);
    int countActiveCycleParents(@Param("cycleId") Long cycleId);
    int countActiveCaseTasks(@Param("cycleId") Long cycleId, @Param("cycleCaseId") Long cycleCaseId);
    int insertTask(ExecutionTaskInsertDTO request);
    int insertExecution(ExecutionInsertDTO request);
    int insertEvent(ExecutionEventInsertDTO request);
    int insertAttachment(ExecutionAttachmentInsertDTO request);
    List<Map<String,Object>> selectAttachments(@Param("executionId") Long executionId);
    Map<String,Object> selectAttachmentById(@Param("id") Long id);
    Map<String,Object> selectTask(@Param("id") Long id);
    List<Map<String,Object>> selectChildTasks(@Param("parentTaskId") Long parentTaskId);
    List<Map<String,Object>> selectChildTasksForUpdate(@Param("parentTaskId") Long parentTaskId);
    List<Map<String,Object>> selectExecutions(@Param("taskId") Long taskId);
    List<Map<String,Object>> selectEvents(@Param("executionId") Long executionId);
    Map<String,Object> selectExecutionForUpdate(@Param("taskId") Long taskId, @Param("executionId") Long executionId);
    Map<String,Object> selectLatestExecutionForUpdate(@Param("taskId") Long taskId);
    List<Map<String,Object>> selectStaleTasks();
    List<Map<String,Object>> selectChatGptClaimableTasks(@Param("limit") int limit);
    List<Map<String,Object>> selectClaimableTasks(@Param("runnerType") String runnerType, @Param("limit") int limit);
    int selectNextAttemptNo(@Param("cycleCaseId") Long cycleCaseId);
    int updateCycleCase(@Param("cycleCaseId") Long cycleCaseId, @Param("status") String status, @Param("result") String result);
    int completeCycleIfAllCasesTerminal(@Param("cycleId") Long cycleId);
    int updateTaskStarted(@Param("id") Long id, @Param("executor") String executor);
    int updateTaskClaimed(@Param("id") Long id, @Param("runnerId") String runnerId,
        @Param("leaseTokenHash") String leaseTokenHash, @Param("leaseSeconds") int leaseSeconds);
    int updateTaskLeaseHeartbeat(@Param("id") Long id, @Param("runnerId") String runnerId,
        @Param("leaseTokenHash") String leaseTokenHash, @Param("leaseSeconds") int leaseSeconds);
    int updateTaskFailed(@Param("id") Long id, @Param("runnerId") String runnerId,
        @Param("leaseTokenHash") String leaseTokenHash, @Param("errorMessage") String errorMessage);
    int updateExecutionStarted(@Param("id") Long id, @Param("executorName") String executorName);
    int updateTaskHeartbeat(@Param("id") Long id);
    int updateExecutionWaitingHuman(@Param("id") Long id, @Param("note") String note);
    int updateTaskWaitingHuman(@Param("id") Long id);
    int updateExecutionCheckpoint(@Param("id") Long id, @Param("checkpointJson") String checkpointJson);
    int updateExecutionCompleted(@Param("id") Long id, @Param("result") String result,
        @Param("actualResult") String actualResult, @Param("logExcerpt") String logExcerpt,
        @Param("errorMessage") String errorMessage);
    int updateExecutionHumanRejected(@Param("id") Long id, @Param("note") String note);
    int updateTaskCompleted(@Param("id") Long id);
    int updateExecutionCancelled(@Param("executionId") Long executionId, @Param("note") String note);
    int updateTaskCancelled(@Param("id") Long id);
    int updateExecutionHumanConfirmed(@Param("id") Long id, @Param("note") String note);
    int updateTaskPending(@Param("id") Long id);
    int updateTaskResumed(@Param("id") Long id);
    int updateExecutionInterrupted(@Param("id") Long id, @Param("note") String note);
    int updateTaskRecoveryRequired(@Param("id") Long id, @Param("note") String note);
    int updateTaskAggregate(@Param("id") Long id, @Param("status") String status);
    Long selectParentTaskId(@Param("id") Long id);
}
