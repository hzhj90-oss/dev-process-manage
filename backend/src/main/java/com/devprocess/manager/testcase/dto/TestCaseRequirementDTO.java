package com.devprocess.manager.testcase.dto;

public class TestCaseRequirementDTO {
    private Long requirementId;
    private Long versionId;
    private String requirementNo;
    private String title;
    private String projectCode;
    private String projectName;
    private String versionNo;
    private String coverageType;

    public Long getRequirementId() { return requirementId; }
    public Long getVersionId() { return versionId; }
    public void setVersionId(Long value) { this.versionId = value; }
    public void setRequirementId(Long value) { this.requirementId = value; }
    public String getRequirementNo() { return requirementNo; }
    public void setRequirementNo(String value) { this.requirementNo = value; }
    public String getTitle() { return title; }
    public void setTitle(String value) { this.title = value; }
    public String getProjectCode() { return projectCode; }
    public void setProjectCode(String value) { this.projectCode = value; }
    public String getProjectName() { return projectName; }
    public void setProjectName(String value) { this.projectName = value; }
    public String getVersionNo() { return versionNo; }
    public void setVersionNo(String value) { this.versionNo = value; }
    public String getCoverageType() { return coverageType; }
    public void setCoverageType(String value) { this.coverageType = value; }
}