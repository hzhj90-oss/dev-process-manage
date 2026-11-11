package com.devprocess.manager.requirement.dto;
import java.time.LocalDateTime;

public class RequirementDesignDTO {
    private Long id, requirementId;
    private Integer revisionNo;
    private String designType, title, contentMarkdown, attachmentPath, status, authorName;
    private LocalDateTime createdAt;
    public Long getId() { return id; }
    public void setId(Long v) { id = v; }
    public Long getRequirementId() { return requirementId; }
    public void setRequirementId(Long v) { requirementId = v; }
    public Integer getRevisionNo() { return revisionNo; }
    public void setRevisionNo(Integer v) { revisionNo = v; }
    public String getDesignType() { return designType; }
    public void setDesignType(String v) { designType = v; }
    public String getTitle() { return title; }
    public void setTitle(String v) { title = v; }
    public String getContentMarkdown() { return contentMarkdown; }
    public void setContentMarkdown(String v) { contentMarkdown = v; }
    public String getAttachmentPath() { return attachmentPath; }
    public void setAttachmentPath(String v) { attachmentPath = v; }
    public String getStatus() { return status; }
    public void setStatus(String v) { status = v; }
    public String getAuthorName() { return authorName; }
    public void setAuthorName(String v) { authorName = v; }
    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime v) { createdAt = v; }
}