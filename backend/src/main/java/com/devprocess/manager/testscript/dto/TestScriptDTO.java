package com.devprocess.manager.testscript.dto;

import java.time.LocalDateTime;

public class TestScriptDTO {
    private Long id;
    private String scriptCode;
    private String scriptName;
    private String scriptLanguage;
    private String runtimeVersion;
    private String scriptVersion;
    private Integer revisionNo;
    private Long currentRevisionId;
    private String sourceType;
    private String sourcePath;
    private String sourceContent;
    private String entryPoint;
    private String argumentsJson;
    private Boolean enabled;
    private String description;
    private String changeNote;
    private String createdBy;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;

    public Long getId() { return id; }
    public void setId(Long v) { id = v; }
    public String getScriptCode() { return scriptCode; }
    public void setScriptCode(String v) { scriptCode = v; }
    public String getScriptName() { return scriptName; }
    public void setScriptName(String v) { scriptName = v; }
    public String getScriptLanguage() { return scriptLanguage; }
    public void setScriptLanguage(String v) { scriptLanguage = v; }
    public String getRuntimeVersion() { return runtimeVersion; }
    public void setRuntimeVersion(String v) { runtimeVersion = v; }
    public String getScriptVersion() { return scriptVersion; }
    public void setScriptVersion(String v) { scriptVersion = v; }
    public Integer getRevisionNo() { return revisionNo; }
    public void setRevisionNo(Integer v) { revisionNo = v; }
    public Long getCurrentRevisionId() { return currentRevisionId; }
    public void setCurrentRevisionId(Long v) { currentRevisionId = v; }
    public String getSourceType() { return sourceType; }
    public void setSourceType(String v) { sourceType = v; }
    public String getSourcePath() { return sourcePath; }
    public void setSourcePath(String v) { sourcePath = v; }
    public String getSourceContent() { return sourceContent; }
    public void setSourceContent(String v) { sourceContent = v; }
    public String getEntryPoint() { return entryPoint; }
    public void setEntryPoint(String v) { entryPoint = v; }
    public String getArgumentsJson() { return argumentsJson; }
    public void setArgumentsJson(String v) { argumentsJson = v; }
    public Boolean getEnabled() { return enabled; }
    public void setEnabled(Boolean v) { enabled = v; }
    public String getDescription() { return description; }
    public void setDescription(String v) { description = v; }
    public String getChangeNote() { return changeNote; }
    public void setChangeNote(String v) { changeNote = v; }
    public String getCreatedBy() { return createdBy; }
    public void setCreatedBy(String v) { createdBy = v; }
    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime v) { createdAt = v; }
    public LocalDateTime getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(LocalDateTime v) { updatedAt = v; }
}
