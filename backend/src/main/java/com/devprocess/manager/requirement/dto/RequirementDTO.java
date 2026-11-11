package com.devprocess.manager.requirement.dto;

import java.time.LocalDateTime;

public class RequirementDTO {
    private Long id;
    private Long versionId;
    private String versionNo;
    private String versionName;
    private String projectCode;
    private String projectName;
    private String requirementNo;
    private String title;
    private String requirementType;
    private String contentMarkdown;
    private String status;
    private String priority;
    private String ownerName;
    private Integer sortOrder;
    private Long designCount;
    private Long linkedCaseCount;
    private Integer latestDesignRevisionNo;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;

    public Long getId() { return id; }
    public void setId(Long value) { this.id = value; }
    public Long getVersionId() { return versionId; }
    public void setVersionId(Long value) { this.versionId = value; }
    public String getVersionNo() { return versionNo; }
    public void setVersionNo(String value) { this.versionNo = value; }
    public String getVersionName() { return versionName; }
    public void setVersionName(String value) { this.versionName = value; }
    public String getProjectCode() { return projectCode; }
    public void setProjectCode(String value) { this.projectCode = value; }
    public String getProjectName() { return projectName; }
    public void setProjectName(String value) { this.projectName = value; }
    public String getRequirementNo() { return requirementNo; }
    public void setRequirementNo(String value) { this.requirementNo = value; }
    public String getTitle() { return title; }
    public void setTitle(String value) { this.title = value; }
    public String getRequirementType() { return requirementType; }
    public void setRequirementType(String value) { this.requirementType = value; }
    public String getContentMarkdown() { return contentMarkdown; }
    public void setContentMarkdown(String value) { this.contentMarkdown = value; }
    public String getStatus() { return status; }
    public void setStatus(String value) { this.status = value; }
    public String getPriority() { return priority; }
    public void setPriority(String value) { this.priority = value; }
    public String getOwnerName() { return ownerName; }
    public void setOwnerName(String value) { this.ownerName = value; }
    public Integer getSortOrder() { return sortOrder; }
    public void setSortOrder(Integer value) { this.sortOrder = value; }
    public Long getDesignCount() { return designCount; }
    public void setDesignCount(Long value) { this.designCount = value; }
    public Long getLinkedCaseCount() { return linkedCaseCount; }
    public void setLinkedCaseCount(Long value) { this.linkedCaseCount = value; }
    public Integer getLatestDesignRevisionNo() { return latestDesignRevisionNo; }
    public void setLatestDesignRevisionNo(Integer value) { this.latestDesignRevisionNo = value; }
    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime value) { this.createdAt = value; }
    public LocalDateTime getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(LocalDateTime value) { this.updatedAt = value; }
}