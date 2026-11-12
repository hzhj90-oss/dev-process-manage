package com.devprocess.manager.execution.dto;

import javax.validation.constraints.NotBlank;
import javax.validation.constraints.Pattern;
import javax.validation.constraints.Size;

public class RunnerClaimRequest {
    @NotBlank
    @Size(max = 64)
    @Pattern(regexp = "^[A-Za-z0-9._-]+$", message = "Runner 标识仅允许字母、数字、点、下划线和连字符")
    private String runnerId;
    @Size(max = 16)
    @Pattern(regexp = "^(HTTP|NODE|BROWSER)$", message = "Runner 类型仅支持 HTTP、NODE 或 BROWSER")
    private String runnerType = "HTTP";

    public String getRunnerId() { return runnerId; }
    public void setRunnerId(String value) { runnerId = value; }
    public String getRunnerType() { return runnerType; }
    public void setRunnerType(String value) { runnerType = value; }
}
