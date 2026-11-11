package com.devprocess.manager.environment.dto;

import java.time.LocalDateTime;

public class EnvironmentDTO {
    private Long id;
    private String environmentCode, environmentName, environmentType;
    private String baseUrl, apiBaseUrl, authType, credentialRef, configJson, description;
    private Boolean active;
    private Integer sortOrder;
    private LocalDateTime createdAt, updatedAt;

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
    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime v) { createdAt = v; }
    public LocalDateTime getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(LocalDateTime v) { updatedAt = v; }
}
