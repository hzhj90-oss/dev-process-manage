package com.devprocess.manager.testcycle.dto;

import java.util.List;

public class TestCycleCaseDTO {
    private Long id, cycleId, testCaseId, testCaseRevisionId;
    private String caseNo, title, executionMode, executionStatus, latestResult, caseSnapshotJson;
    private Integer revisionNo, sequenceNo;
    private List<TestCycleRequirementDTO> requirements;

    public Long getId() { return id; }
    public void setId(Long v) { id = v; }
    public Long getCycleId() { return cycleId; }
    public void setCycleId(Long v) { cycleId = v; }
    public Long getTestCaseId() { return testCaseId; }
    public void setTestCaseId(Long v) { testCaseId = v; }
    public Long getTestCaseRevisionId() { return testCaseRevisionId; }
    public void setTestCaseRevisionId(Long v) { testCaseRevisionId = v; }
    public String getCaseNo() { return caseNo; }
    public void setCaseNo(String v) { caseNo = v; }
    public String getTitle() { return title; }
    public void setTitle(String v) { title = v; }
    public String getExecutionMode() { return executionMode; }
    public void setExecutionMode(String v) { executionMode = v; }
    public String getExecutionStatus() { return executionStatus; }
    public void setExecutionStatus(String v) { executionStatus = v; }
    public String getLatestResult() { return latestResult; }
    public void setLatestResult(String v) { latestResult = v; }
    public String getCaseSnapshotJson() { return caseSnapshotJson; }
    public void setCaseSnapshotJson(String v) { caseSnapshotJson = v; }
    public Integer getRevisionNo() { return revisionNo; }
    public void setRevisionNo(Integer v) { revisionNo = v; }
    public Integer getSequenceNo() { return sequenceNo; }
    public void setSequenceNo(Integer v) { sequenceNo = v; }
    public List<TestCycleRequirementDTO> getRequirements() { return requirements; }
    public void setRequirements(List<TestCycleRequirementDTO> v) { requirements = v; }
}
