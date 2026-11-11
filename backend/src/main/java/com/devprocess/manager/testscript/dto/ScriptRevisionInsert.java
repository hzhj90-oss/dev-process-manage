package com.devprocess.manager.testscript.dto;

public class ScriptRevisionInsert {
    private Long id;
    private Long scriptId;
    private Integer revisionNo;
    private String scriptVersion;
    private String scriptLanguage;
    private String runtimeVersion;
    private String sourceType;
    private String sourcePath;
    private String sourceContent;
    private String entryPoint;
    private String argumentsJson;
    private String changeNote;
    private String createdBy;

    public Long getId() { return id; }
    public void setId(Long v) { id = v; }
    public Long getScriptId() { return scriptId; }
    public void setScriptId(Long v) { scriptId = v; }
    public Integer getRevisionNo() { return revisionNo; }
    public void setRevisionNo(Integer v) { revisionNo = v; }
    public String getScriptVersion() { return scriptVersion; }
    public void setScriptVersion(String v) { scriptVersion = v; }
    public String getScriptLanguage() { return scriptLanguage; }
    public void setScriptLanguage(String v) { scriptLanguage = v; }
    public String getRuntimeVersion() { return runtimeVersion; }
    public void setRuntimeVersion(String v) { runtimeVersion = v; }
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
    public String getChangeNote() { return changeNote; }
    public void setChangeNote(String v) { changeNote = v; }
    public String getCreatedBy() { return createdBy; }
    public void setCreatedBy(String v) { createdBy = v; }
}
