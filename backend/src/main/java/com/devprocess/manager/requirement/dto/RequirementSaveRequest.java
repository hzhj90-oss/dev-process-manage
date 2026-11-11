package com.devprocess.manager.requirement.dto;
import javax.validation.constraints.NotBlank;
import javax.validation.constraints.NotNull;
import javax.validation.constraints.Size;

public class RequirementSaveRequest {
    private Long id;
    @NotNull(message = "所属版本不能为空") private Long versionId;
    public Long getId() { return id; }
    public void setId(Long v) { id = v; }
    @NotBlank(message = "需求编号不能为空") @Size(max = 64) private String requirementNo;
    @NotBlank(message = "需求标题不能为空") @Size(max = 255) private String title;
    @Size(max = 32) private String requirementType;
    private String contentMarkdown;
    private String status = "DRAFT";
    private String priority = "MEDIUM";
    @Size(max = 64) private String ownerName;
    private Integer sortOrder = 0;
    public Long getVersionId() { return versionId; }
    public void setVersionId(Long v) { versionId = v; }
    public String getRequirementNo() { return requirementNo; }
    public void setRequirementNo(String v) { requirementNo = v; }
    public String getTitle() { return title; }
    public void setTitle(String v) { title = v; }
    public String getRequirementType() { return requirementType; }
    public void setRequirementType(String v) { requirementType = v; }
    public String getContentMarkdown() { return contentMarkdown; }
    public void setContentMarkdown(String v) { contentMarkdown = v; }
    public String getStatus() { return status; }
    public void setStatus(String v) { status = v; }
    public String getPriority() { return priority; }
    public void setPriority(String v) { priority = v; }
    public String getOwnerName() { return ownerName; }
    public void setOwnerName(String v) { ownerName = v; }
    public Integer getSortOrder() { return sortOrder; }
    public void setSortOrder(Integer v) { sortOrder = v; }
}