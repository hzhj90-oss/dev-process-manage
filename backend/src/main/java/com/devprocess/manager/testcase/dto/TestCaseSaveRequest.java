package com.devprocess.manager.testcase.dto;

import javax.validation.Valid;
import javax.validation.constraints.NotBlank;
import javax.validation.constraints.NotEmpty;
import javax.validation.constraints.Size;
import java.util.ArrayList;
import java.util.List;

public class TestCaseSaveRequest {
    private Long id;
    @NotBlank(message = "用例编号不能为空")
    @Size(max = 64, message = "用例编号不能超过64个字符")
    private String caseNo;
    @NotBlank(message = "用例名称不能为空")
    @Size(max = 255, message = "用例名称不能超过255个字符")
    private String title;
    private String status = "ACTIVE";
    @Size(max = 64, message = "负责人不能超过64个字符")
    private String ownerName;
    private String preconditions;
    @Valid
    @NotEmpty(message = "至少需要一个测试步骤")
    private List<TestCaseStepDTO> steps = new ArrayList<TestCaseStepDTO>();
    @NotBlank(message = "整体预期结果不能为空")
    private String expectedResult;
    @NotBlank(message = "用例类型不能为空")
    @Size(max = 32)
    private String testType = "FUNCTIONAL";
    @NotBlank(message = "优先级不能为空")
    @Size(max = 16)
    private String priority = "MEDIUM";
    @NotBlank(message = "执行方式不能为空")
    @Size(max = 24)
    private String executionMode = "MANUAL";
    private Long scriptId;
    private String aiInstruction;
    private String testDataJson;
    @Size(max = 1000, message = "修订说明不能超过1000个字符")
    private String changeNote;
    private List<Long> requirementIds = new ArrayList<Long>();
    @Size(max = 64)
    private String createdBy;

    public Long getId() { return id; }
    public void setId(Long value) { this.id = value; }
    public String getCaseNo() { return caseNo; }
    public void setCaseNo(String value) { this.caseNo = value; }
    public String getTitle() { return title; }
    public void setTitle(String value) { this.title = value; }
    public String getStatus() { return status; }
    public void setStatus(String value) { this.status = value; }
    public String getOwnerName() { return ownerName; }
    public void setOwnerName(String value) { this.ownerName = value; }
    public String getPreconditions() { return preconditions; }
    public void setPreconditions(String value) { this.preconditions = value; }
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
    public String getAiInstruction() { return aiInstruction; }
    public void setAiInstruction(String value) { this.aiInstruction = value; }
    public String getTestDataJson() { return testDataJson; }
    public void setTestDataJson(String value) { this.testDataJson = value; }
    public String getChangeNote() { return changeNote; }
    public void setChangeNote(String value) { this.changeNote = value; }
    public List<Long> getRequirementIds() { return requirementIds; }
    public void setRequirementIds(List<Long> value) { this.requirementIds = value; }
    public String getCreatedBy() { return createdBy; }
    public void setCreatedBy(String value) { this.createdBy = value; }
}