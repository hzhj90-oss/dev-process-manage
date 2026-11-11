package com.devprocess.manager.testcase.dto;

import javax.validation.constraints.NotBlank;
import javax.validation.constraints.Size;

public class TestCaseStepDTO {
    private Integer stepNo;
    @NotBlank(message = "步骤操作不能为空")
    @Size(max = 2000, message = "步骤操作不能超过2000个字符")
    private String action;
    @Size(max = 4000, message = "操作数据不能超过4000个字符")
    private String testData;
    @NotBlank(message = "步骤预期结果不能为空")
    @Size(max = 2000, message = "步骤预期结果不能超过2000个字符")
    private String expectedResult;

    public Integer getStepNo() { return stepNo; }
    public void setStepNo(Integer value) { this.stepNo = value; }
    public String getAction() { return action; }
    public void setAction(String value) { this.action = value; }
    public String getTestData() { return testData; }
    public void setTestData(String value) { this.testData = value; }
    public String getExpectedResult() { return expectedResult; }
    public void setExpectedResult(String value) { this.expectedResult = value; }
}