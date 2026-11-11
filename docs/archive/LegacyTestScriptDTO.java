package com.devprocess.manager.testcase.dto;

public class TestScriptDTO {
    private Long id;
    private String scriptCode;
    private String scriptName;
    private String scriptLanguage;
    private String runtimeVersion;
    private String description;

    public Long getId() { return id; }
    public void setId(Long value) { this.id = value; }
    public String getScriptCode() { return scriptCode; }
    public void setScriptCode(String value) { this.scriptCode = value; }
    public String getScriptName() { return scriptName; }
    public void setScriptName(String value) { this.scriptName = value; }
    public String getScriptLanguage() { return scriptLanguage; }
    public void setScriptLanguage(String value) { this.scriptLanguage = value; }
    public String getRuntimeVersion() { return runtimeVersion; }
    public void setRuntimeVersion(String value) { this.runtimeVersion = value; }
    public String getDescription() { return description; }
    public void setDescription(String value) { this.description = value; }
}