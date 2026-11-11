package com.devprocess.manager.testcycle.dto;

import java.util.List;

public class TestCycleDTO extends TestCycleSummaryDTO {
    private String environmentSnapshotJson;
    private String scopeJson;
    private String description;
    private String createdBy;
    private List<TestCycleCaseDTO> cases;

    public String getEnvironmentSnapshotJson() { return environmentSnapshotJson; }
    public void setEnvironmentSnapshotJson(String v) { environmentSnapshotJson = v; }
    public String getScopeJson() { return scopeJson; }
    public void setScopeJson(String v) { scopeJson = v; }
    public String getDescription() { return description; }
    public void setDescription(String v) { description = v; }
    public String getCreatedBy() { return createdBy; }
    public void setCreatedBy(String v) { createdBy = v; }
    public List<TestCycleCaseDTO> getCases() { return cases; }
    public void setCases(List<TestCycleCaseDTO> v) { cases = v; }
}
