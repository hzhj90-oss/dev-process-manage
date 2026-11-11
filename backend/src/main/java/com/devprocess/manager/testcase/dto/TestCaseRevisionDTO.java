package com.devprocess.manager.testcase.dto;

import com.fasterxml.jackson.annotation.JsonIgnore;
import java.time.LocalDateTime;
import java.util.List;

public class TestCaseRevisionDTO {
    private Long id;
    private Long testCaseId;
    private Integer revisionNo;
    private String preconditions;
    private String stepsJson;
    private List<TestCaseStepDTO> steps;
    private String expectedResult;
    private String testType;
    private String priority;
    private String executionMode;
    private Long scriptId;
    private Long scriptRevisionId;
    private String scriptVersion;
    private String aiInstruction;
    private String testDataJson;
    private String changeNote;
    private String createdBy;
    private LocalDateTime createdAt;

    public Long getId() { return id; }
    public void setId(Long value) { this.id = value; }
    public Long getTestCaseId() { return testCaseId; }
    public void setTestCaseId(Long value) { this.testCaseId = value; }
    public Integer getRevisionNo() { return revisionNo; }
    public void setRevisionNo(Integer value) { this.revisionNo = value; }
    public String getPreconditions() { return preconditions; }
    public void setPreconditions(String value) { this.preconditions = value; }
    @JsonIgnore
    public String getStepsJson() { return stepsJson; }
    public void setStepsJson(String value) { this.stepsJson = value; }
    public List<TestCaseStepDTO> getSteps() { return steps; }
    public void setSteps(List<TestCaseStepDTO> value) { this.steps = value; }
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
    public Long getScriptRevisionId() { return scriptRevisionId; }
    public void setScriptRevisionId(Long value) { this.scriptRevisionId = value; }
    public String getScriptVersion() { return scriptVersion; }
    public void setScriptVersion(String value) { this.scriptVersion = value; }
    public String getAiInstruction() { return aiInstruction; }
    public void setAiInstruction(String value) { this.aiInstruction = value; }
    public String getTestDataJson() { return testDataJson; }
    public void setTestDataJson(String value) { this.testDataJson = value; }
    public String getChangeNote() { return changeNote; }
    public void setChangeNote(String value) { this.changeNote = value; }
    public String getCreatedBy() { return createdBy; }
    public void setCreatedBy(String value) { this.createdBy = value; }
    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime value) { this.createdAt = value; }
}