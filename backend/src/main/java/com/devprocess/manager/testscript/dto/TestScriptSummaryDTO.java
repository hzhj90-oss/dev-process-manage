package com.devprocess.manager.testscript.dto;

import java.time.LocalDateTime;

/** 列表摘要，不返回完整脚本源码。 */
public class TestScriptSummaryDTO {
    private Long id;
    private String scriptCode;
    private String scriptName;
    private String scriptLanguage;
    private String runtimeVersion;
    private String scriptVersion;
    private Integer revisionNo;
    private Boolean enabled;
    private String description;
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
    public Boolean getEnabled() { return enabled; }
    public void setEnabled(Boolean v) { enabled = v; }
    public String getDescription() { return description; }
    public void setDescription(String v) { description = v; }
    public LocalDateTime getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(LocalDateTime v) { updatedAt = v; }
}
