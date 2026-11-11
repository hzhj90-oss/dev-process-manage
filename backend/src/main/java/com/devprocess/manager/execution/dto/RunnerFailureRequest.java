package com.devprocess.manager.execution.dto;

import javax.validation.constraints.NotBlank;
import javax.validation.constraints.Size;

public class RunnerFailureRequest {
    @NotBlank
    @Size(max = 4000)
    private String errorMessage;

    @Size(max = 20000)
    private String logExcerpt;

    public String getErrorMessage() { return errorMessage; }
    public void setErrorMessage(String value) { errorMessage = value; }
    public String getLogExcerpt() { return logExcerpt; }
    public void setLogExcerpt(String value) { logExcerpt = value; }
}
