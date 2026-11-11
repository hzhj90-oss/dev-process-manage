package com.devprocess.manager.project.dto;

import javax.validation.constraints.NotBlank;
import javax.validation.constraints.Size;

public class ProjectSaveRequest {
    private Long id;

    @NotBlank(message = "项目编码不能为空")
    @Size(max = 64, message = "项目编码不能超过64个字符")
    private String projectCode;

    @NotBlank(message = "项目名称不能为空")
    @Size(max = 128, message = "项目名称不能超过128个字符")
    private String projectName;

    @Size(max = 1000, message = "项目说明不能超过1000个字符")
    private String description;

    @Size(max = 512, message = "仓库地址不能超过512个字符")
    private String repositoryUrl;

    @Size(max = 128, message = "主分支名称不能超过128个字符")
    private String mainBranch;

    private String status = "ACTIVE";

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public String getProjectCode() { return projectCode; }
    public void setProjectCode(String value) { this.projectCode = value; }
    public String getProjectName() { return projectName; }
    public void setProjectName(String value) { this.projectName = value; }
    public String getDescription() { return description; }
    public void setDescription(String value) { this.description = value; }
    public String getRepositoryUrl() { return repositoryUrl; }
    public void setRepositoryUrl(String value) { this.repositoryUrl = value; }
    public String getMainBranch() { return mainBranch; }
    public void setMainBranch(String value) { this.mainBranch = value; }
    public String getStatus() { return status; }
    public void setStatus(String value) { this.status = value; }
}