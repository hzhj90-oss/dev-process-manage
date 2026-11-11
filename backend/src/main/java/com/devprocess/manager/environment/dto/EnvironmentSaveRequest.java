package com.devprocess.manager.environment.dto;

import com.fasterxml.jackson.annotation.JsonIgnore;
import javax.validation.constraints.NotBlank;
import javax.validation.constraints.NotNull;
import javax.validation.constraints.Pattern;
import javax.validation.constraints.Size;

public class EnvironmentSaveRequest {
    private Long id;
    @NotBlank @Size(max = 32)
    @Pattern(regexp = "^[A-Z][A-Z0-9_]{1,31}$", message = "环境编码仅允许大写字母、数字和下划线")
    private String environmentCode;
    @NotBlank @Size(max = 64)
    private String environmentName;
    @NotBlank @Size(max = 24)
    private String environmentType;
    @Size(max = 512)
    private String baseUrl, apiBaseUrl;
    @Size(max = 32)
    private String authType = "NONE";
    @Size(max = 255)
    private String credentialRef;
    @Size(max = 10000)
    private String configJson;
    @Size(max = 1000)
    private String description;
    @NotNull
    private Boolean active = Boolean.TRUE;
    private Integer sortOrder = 0;

    @JsonIgnore
    public Long getId() { return id; }
    public void setId(Long v) { id = v; }
    public String getEnvironmentCode() { return environmentCode; }
    public void setEnvironmentCode(String v) { environmentCode = v; }
    public String getEnvironmentName() { return environmentName; }
    public void setEnvironmentName(String v) { environmentName = v; }
    public String getEnvironmentType() { return environmentType; }
    public void setEnvironmentType(String v) { environmentType = v; }
    public String getBaseUrl() { return baseUrl; }
    public void setBaseUrl(String v) { baseUrl = v; }
    public String getApiBaseUrl() { return apiBaseUrl; }
    public void setApiBaseUrl(String v) { apiBaseUrl = v; }
    public String getAuthType() { return authType; }
    public void setAuthType(String v) { authType = v; }
    public String getCredentialRef() { return credentialRef; }
    public void setCredentialRef(String v) { credentialRef = v; }
    public String getConfigJson() { return configJson; }
    public void setConfigJson(String v) { configJson = v; }
    public String getDescription() { return description; }
    public void setDescription(String v) { description = v; }
    public Boolean getActive() { return active; }
    public void setActive(Boolean v) { active = v; }
    public Integer getSortOrder() { return sortOrder; }
    public void setSortOrder(Integer v) { sortOrder = v; }
}
