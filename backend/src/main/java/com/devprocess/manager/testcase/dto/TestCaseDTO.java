package com.devprocess.manager.testcase.dto;

import java.time.LocalDateTime;
import java.util.List;

public class TestCaseDTO {
    private Long id;
    private String caseNo;
    private String title;
    private String status;
    private Integer currentRevisionNo;
    private Long currentRevisionId;
    private String ownerName;
    private Integer revisionNo;
    private String preconditions;
    private String expectedResult;
    private String testType;
    private String priority;
    private String executionMode;
    private Long scriptId;
    private String scriptName;
    private Long requirementCount;
    private List<TestCaseRequirementDTO> requirements;
    private TestCaseRevisionDTO currentRevision;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;

    public Long getId() { return id; }
    public void setId(Long value) { this.id = value; }
    public String getCaseNo() { return caseNo; }
    public void setCaseNo(String value) { this.caseNo = value; }
    public String getTitle() { return title; }
    public void setTitle(String value) { this.title = value; }
    public String getStatus() { return status; }
    public void setStatus(String value) { this.status = value; }
    public Integer getCurrentRevisionNo() { return currentRevisionNo; }
    public void setCurrentRevisionNo(Integer value) { this.currentRevisionNo = value; }
    public Long getCurrentRevisionId() { return currentRevisionId; }
    public void setCurrentRevisionId(Long value) { this.currentRevisionId = value; }
    public String getOwnerName() { return ownerName; }
    public void setOwnerName(String value) { this.ownerName = value; }
    public Integer getRevisionNo() { return revisionNo; }
    public void setRevisionNo(Integer value) { this.revisionNo = value; }
    public String getPreconditions() { return preconditions; }
    public void setPreconditions(String value) { this.preconditions = value; }
    public String getExpectedResult() { return expectedResult; }
    public void setExpectedResult(String value) { this.expectedResult = value; }
    public String getTestType() { return testType; }
    public void setTestType(String value) { this.testType = value; }
    public String getPriority() { return priority; }
    public void setPriority(String value) { this.priority = value; }
    public String getExecutionMode() { return executionMode; }
    public void setExecutionMode(String value) { this.executionMode = value; }
    public Long getScriptId() { return scriptId; }
    public void setScriptId(Long value) { this.scriptId = value; }
    public String getScriptName() { return scriptName; }
    public void setScriptName(String value) { this.scriptName = value; }
    public Long getRequirementCount() { return requirementCount; }
    public void setRequirementCount(Long value) { this.requirementCount = value; }
    public List<TestCaseRequirementDTO> getRequirements() { return requirements; }
    public void setRequirements(List<TestCaseRequirementDTO> value) { this.requirements = value; }
    public TestCaseRevisionDTO getCurrentRevision() { return currentRevision; }
    public void setCurrentRevision(TestCaseRevisionDTO value) { this.currentRevision = value; }
    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime value) { this.createdAt = value; }
    public LocalDateTime getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(LocalDateTime value) { this.updatedAt = value; }
}