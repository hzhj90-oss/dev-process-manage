package com.devprocess.manager.testcycle.dto;

public class TestCycleRequirementDTO {
    private Long id, requirementId;
    private String requirementNo, title, coverageType;
    private String requirementSnapshotJson, designSnapshotJson;

    public Long getId() { return id; }
    public void setId(Long v) { id = v; }
    public Long getRequirementId() { return requirementId; }
    public void setRequirementId(Long v) { requirementId = v; }
    public String getRequirementNo() { return requirementNo; }
    public void setRequirementNo(String v) { requirementNo = v; }
    public String getTitle() { return title; }
    public void setTitle(String v) { title = v; }
    public String getCoverageType() { return coverageType; }
    public void setCoverageType(String v) { coverageType = v; }
    public String getRequirementSnapshotJson() { return requirementSnapshotJson; }
    public void setRequirementSnapshotJson(String v) { requirementSnapshotJson = v; }
    public String getDesignSnapshotJson() { return designSnapshotJson; }
    public void setDesignSnapshotJson(String v) { designSnapshotJson = v; }
}
