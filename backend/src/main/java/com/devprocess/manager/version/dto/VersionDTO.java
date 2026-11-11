package com.devprocess.manager.version.dto;

import java.time.LocalDate;
import java.time.LocalDateTime;

public class VersionDTO {
    private Long id;
    private Long projectId;
    private String projectCode;
    private String projectName;
    private String versionNo;
    private String versionName;
    private String status;
    private LocalDate plannedStartDate;
    private LocalDate plannedReleaseDate;
    private LocalDateTime releasedAt;
    private String description;
    private Long requirementCount;
    private Long cycleCount;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;

    public Long getId() { return id; }
    public void setId(Long value) { this.id = value; }
    public Long getProjectId() { return projectId; }
    public void setProjectId(Long value) { this.projectId = value; }
    public String getProjectCode() { return projectCode; }
    public void setProjectCode(String value) { this.projectCode = value; }
    public String getProjectName() { return projectName; }
    public void setProjectName(String value) { this.projectName = value; }
    public String getVersionNo() { return versionNo; }
    public void setVersionNo(String value) { this.versionNo = value; }
    public String getVersionName() { return versionName; }
    public void setVersionName(String value) { this.versionName = value; }
    public String getStatus() { return status; }
    public void setStatus(String value) { this.status = value; }
    public LocalDate getPlannedStartDate() { return plannedStartDate; }
    public void setPlannedStartDate(LocalDate value) { this.plannedStartDate = value; }
    public LocalDate getPlannedReleaseDate() { return plannedReleaseDate; }
    public void setPlannedReleaseDate(LocalDate value) { this.plannedReleaseDate = value; }
    public LocalDateTime getReleasedAt() { return releasedAt; }
    public void setReleasedAt(LocalDateTime value) { this.releasedAt = value; }
    public String getDescription() { return description; }
    public void setDescription(String value) { this.description = value; }
    public Long getRequirementCount() { return requirementCount; }
    public void setRequirementCount(Long value) { this.requirementCount = value; }
    public Long getCycleCount() { return cycleCount; }
    public void setCycleCount(Long value) { this.cycleCount = value; }
    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime value) { this.createdAt = value; }
    public LocalDateTime getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(LocalDateTime value) { this.updatedAt = value; }
}