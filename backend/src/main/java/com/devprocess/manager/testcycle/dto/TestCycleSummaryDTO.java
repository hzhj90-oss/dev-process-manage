package com.devprocess.manager.testcycle.dto;

import java.time.LocalDateTime;

public class TestCycleSummaryDTO {
    private Long id, versionId, environmentId;
    private String projectCode, projectName, versionNo, cycleName, cycleStage;
    private String environmentCode, environmentName, codeVersion, gitBranch, gitCommit, buildNo, status;
    private Long caseCount, passCount, failCount, blockedCount, skippedCount, notRunCount;
    private LocalDateTime startedAt, completedAt, createdAt;

    public Long getId() { return id; }
    public void setId(Long v) { id = v; }
    public Long getVersionId() { return versionId; }
    public void setVersionId(Long v) { versionId = v; }
    public Long getEnvironmentId() { return environmentId; }
    public void setEnvironmentId(Long v) { environmentId = v; }
    public String getProjectCode() { return projectCode; }
    public void setProjectCode(String v) { projectCode = v; }
    public String getProjectName() { return projectName; }
    public void setProjectName(String v) { projectName = v; }
    public String getVersionNo() { return versionNo; }
    public void setVersionNo(String v) { versionNo = v; }
    public Integer getCycleNo() { return cycleNo; }
    public void setCycleNo(Integer v) { cycleNo = v; }
    private Integer cycleNo;
    public String getCycleName() { return cycleName; }
    public void setCycleName(String v) { cycleName = v; }
    public String getCycleStage() { return cycleStage; }
    public void setCycleStage(String v) { cycleStage = v; }
    public String getEnvironmentCode() { return environmentCode; }
    public void setEnvironmentCode(String v) { environmentCode = v; }
    public String getEnvironmentName() { return environmentName; }
    public void setEnvironmentName(String v) { environmentName = v; }
    public String getCodeVersion() { return codeVersion; }
    public void setCodeVersion(String v) { codeVersion = v; }
    public String getGitBranch() { return gitBranch; }
    public void setGitBranch(String v) { gitBranch = v; }
    public String getGitCommit() { return gitCommit; }
    public void setGitCommit(String v) { gitCommit = v; }
    public String getBuildNo() { return buildNo; }
    public void setBuildNo(String v) { buildNo = v; }
    public String getStatus() { return status; }
    public void setStatus(String v) { status = v; }
    public Long getCaseCount() { return caseCount; }
    public void setCaseCount(Long v) { caseCount = v; }
    public Long getPassCount() { return passCount; }
    public void setPassCount(Long v) { passCount = v; }
    public Long getFailCount() { return failCount; }
    public void setFailCount(Long v) { failCount = v; }
    public Long getBlockedCount() { return blockedCount; }
    public void setBlockedCount(Long v) { blockedCount = v; }
    public Long getSkippedCount() { return skippedCount; }
    public void setSkippedCount(Long v) { skippedCount = v; }
    public Long getNotRunCount() { return notRunCount; }
    public void setNotRunCount(Long v) { notRunCount = v; }
    public LocalDateTime getStartedAt() { return startedAt; }
    public void setStartedAt(LocalDateTime v) { startedAt = v; }
    public LocalDateTime getCompletedAt() { return completedAt; }
    public void setCompletedAt(LocalDateTime v) { completedAt = v; }
    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime v) { createdAt = v; }
}
