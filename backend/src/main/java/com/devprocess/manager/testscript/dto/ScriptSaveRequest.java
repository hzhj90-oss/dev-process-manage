package com.devprocess.manager.testscript.dto;

import com.fasterxml.jackson.annotation.JsonIgnore;
import javax.validation.constraints.NotBlank;
import javax.validation.constraints.Size;

public class ScriptSaveRequest {
    private Long id;
    @NotBlank @Size(max = 64)
    private String scriptCode;
    @NotBlank @Size(max = 255)
    private String scriptName;
    @NotBlank @Size(max = 24)
    private String scriptLanguage;
    @Size(max = 64)
    private String runtimeVersion;
    @NotBlank @Size(max = 64)
    private String scriptVersion;
    @NotBlank @Size(max = 16)
    private String sourceType = "INLINE";
    @Size(max = 512)
    private String sourcePath;
    private String sourceContent;
    @NotBlank @Size(max = 255)
    private String entryPoint;
    private String argumentsJson;
    @Size(max = 1000)
    private String description;
    private Boolean enabled;
    @Size(max = 1000)
    private String changeNote;
    @Size(max = 64)
    private String createdBy;

    @JsonIgnore
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
    public String getDescription() { return description; }
    public void setDescription(String v) { description = v; }
    public Boolean getEnabled() { return enabled; }
    public void setEnabled(Boolean v) { enabled = v; }
    public String getChangeNote() { return changeNote; }
    public void setChangeNote(String v) { changeNote = v; }
    public String getCreatedBy() { return createdBy; }
    public void setCreatedBy(String v) { createdBy = v; }
}
