package com.devprocess.manager.execution.dto;

public class ExecutionInsertDTO {
    private Long id, cycleCaseId, taskId;
    private Integer attemptNo;
    private String executionMode, runnerType, triggerSource, executionStatus;
    private String expectedResultSnapshot, requestSnapshotJson, checkpointJson;

    public Long getId() { return id; }
    public void setId(Long value) { id = value; }
    public Long getCycleCaseId() { return cycleCaseId; }
    public void setCycleCaseId(Long value) { cycleCaseId = value; }
    public Long getTaskId() { return taskId; }
    public void setTaskId(Long value) { taskId = value; }
    public Integer getAttemptNo() { return attemptNo; }
    public void setAttemptNo(Integer value) { attemptNo = value; }
    public String getExecutionMode() { return executionMode; }
    public void setExecutionMode(String value) { executionMode = value; }
    public String getRunnerType() { return runnerType; }
    public void setRunnerType(String value) { runnerType = value; }
    public String getTriggerSource() { return triggerSource; }
    public void setTriggerSource(String value) { triggerSource = value; }
    public String getExecutionStatus() { return executionStatus; }
    public void setExecutionStatus(String value) { executionStatus = value; }
    public String getExpectedResultSnapshot() { return expectedResultSnapshot; }
    public void setExpectedResultSnapshot(String value) { expectedResultSnapshot = value; }
    public String getRequestSnapshotJson() { return requestSnapshotJson; }
    public void setRequestSnapshotJson(String value) { requestSnapshotJson = value; }
    public String getCheckpointJson() { return checkpointJson; }
    public void setCheckpointJson(String value) { checkpointJson = value; }
}
