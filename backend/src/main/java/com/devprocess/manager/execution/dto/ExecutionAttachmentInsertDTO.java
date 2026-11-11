package com.devprocess.manager.execution.dto;

public class ExecutionAttachmentInsertDTO {
    private Long id;
    private Long executionId;
    private String attachmentType;
    private String fileName;
    private String relativePath;
    private String mimeType;
    private Long fileSize;
    private String sha256;
    private String createdBy;

    public Long getId() { return id; }
    public void setId(Long v) { id = v; }
    public Long getExecutionId() { return executionId; }
    public void setExecutionId(Long v) { executionId = v; }
    public String getAttachmentType() { return attachmentType; }
    public void setAttachmentType(String v) { attachmentType = v; }
    public String getFileName() { return fileName; }
    public void setFileName(String v) { fileName = v; }
    public String getRelativePath() { return relativePath; }
    public void setRelativePath(String v) { relativePath = v; }
    public String getMimeType() { return mimeType; }
    public void setMimeType(String v) { mimeType = v; }
    public Long getFileSize() { return fileSize; }
    public void setFileSize(Long v) { fileSize = v; }
    public String getSha256() { return sha256; }
    public void setSha256(String v) { sha256 = v; }
    public String getCreatedBy() { return createdBy; }
    public void setCreatedBy(String v) { createdBy = v; }
}
