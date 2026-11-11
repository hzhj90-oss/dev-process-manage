package com.devprocess.manager.testcycle.dto;

import com.fasterxml.jackson.annotation.JsonIgnore;
import javax.validation.constraints.NotBlank;
import javax.validation.constraints.NotEmpty;
import javax.validation.constraints.NotNull;
import javax.validation.constraints.Size;
import java.util.List;

public class TestCycleSaveRequest {
    private Long id;
    @NotNull
    private Long versionId;
    @NotBlank @Size(max = 128)
    private String cycleName;
    @NotBlank @Size(max = 32)
    private String cycleStage;
    @NotNull
    private Long environmentId;
    @NotBlank @Size(max = 128)
    private String codeVersion;
    @Size(max = 128)
    private String gitBranch;
    @Size(max = 64)
    private String gitCommit;
    @Size(max = 128)
    private String buildNo;
    @Size(max = 10000)
    private String scopeJson;
    @Size(max = 2000)
    private String description;
    @NotEmpty @Size(max = 500)
    private List<Long> caseIds;
    @Size(max = 64)
    private String createdBy;

    @JsonIgnore
    public Long getId() { return id; }
    public void setId(Long v) { id = v; }
    public Long getVersionId() { return versionId; }
    public void setVersionId(Long v) { versionId = v; }
    public String getCycleName() { return cycleName; }
    public void setCycleName(String v) { cycleName = v; }
    public String getCycleStage() { return cycleStage; }
    public void setCycleStage(String v) { cycleStage = v; }
    public Long getEnvironmentId() { return environmentId; }
    public void setEnvironmentId(Long v) { environmentId = v; }
    public String getCodeVersion() { return codeVersion; }
    public void setCodeVersion(String v) { codeVersion = v; }
    public String getGitBranch() { return gitBranch; }
    public void setGitBranch(String v) { gitBranch = v; }
    public String getGitCommit() { return gitCommit; }
    public void setGitCommit(String v) { gitCommit = v; }
    public String getBuildNo() { return buildNo; }
    public void setBuildNo(String v) { buildNo = v; }
    public String getScopeJson() { return scopeJson; }
    public void setScopeJson(String v) { scopeJson = v; }
    public String getDescription() { return description; }
    public void setDescription(String v) { description = v; }
    public List<Long> getCaseIds() { return caseIds; }
    public void setCaseIds(List<Long> v) { caseIds = v; }
    public String getCreatedBy() { return createdBy; }
    public void setCreatedBy(String v) { createdBy = v; }
}
