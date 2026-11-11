package com.devprocess.manager.project.dto;

import java.time.LocalDateTime;

public class ProjectDTO {
    private Long id;
    private String projectCode;
    private String projectName;
    private String description;
    private String repositoryUrl;
    private String mainBranch;
    private String status;
    private Long versionCount;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public String getProjectCode() { return projectCode; }
    public void setProjectCode(String value) { this.projectCode = value; }
    public String getProjectName() { return projectName; }
    public void setProjectName(String value) { this.projectName = value; }
    public String getDescription() { return description; }
    public void setDescription(String value) { this.description = value; }
    public String getRepositoryUrl() { return repositoryUrl; }
    public void setRepositoryUrl(String value) { this.repositoryUrl = value; }
    public String getMainBranch() { return mainBranch; }
    public void setMainBranch(String value) { this.mainBranch = value; }
    public String getStatus() { return status; }
    public void setStatus(String value) { this.status = value; }
    public Long getVersionCount() { return versionCount; }
    public void setVersionCount(Long value) { this.versionCount = value; }
    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime value) { this.createdAt = value; }
    public LocalDateTime getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(LocalDateTime value) { this.updatedAt = value; }
}