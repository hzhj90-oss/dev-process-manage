package com.devprocess.manager.execution.dto;

import javax.validation.constraints.NotBlank;
import javax.validation.constraints.Size;

public class ExecutionCompleteRequest {
    @NotBlank @Size(max = 24)
    private String result;
    @Size(max = 10000)
    private String actualResult;
    @Size(max = 20000)
    private String logExcerpt;
    @Size(max = 4000)
    private String errorMessage;
    @Size(max = 64)
    private String executorName;

    public String getResult() { return result; }
    public void setResult(String value) { result = value; }
    public String getActualResult() { return actualResult; }
    public void setActualResult(String value) { actualResult = value; }
    public String getLogExcerpt() { return logExcerpt; }
    public void setLogExcerpt(String value) { logExcerpt = value; }
    public String getErrorMessage() { return errorMessage; }
    public void setErrorMessage(String value) { errorMessage = value; }
    public String getExecutorName() { return executorName; }
    public void setExecutorName(String value) { executorName = value; }
}
