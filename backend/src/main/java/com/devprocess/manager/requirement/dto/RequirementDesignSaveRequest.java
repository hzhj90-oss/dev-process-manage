package com.devprocess.manager.requirement.dto;
import javax.validation.constraints.NotBlank;
import javax.validation.constraints.Size;

public class RequirementDesignSaveRequest {
    @Size(max = 32) private String designType = "GENERAL";
    @NotBlank(message = "设计标题不能为空") @Size(max = 255) private String title;
    @NotBlank(message = "详细设计内容不能为空") private String contentMarkdown;
    @Size(max = 512) private String attachmentPath;
    @Size(max = 24) private String status = "DRAFT";
    @Size(max = 64) private String authorName;
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
}