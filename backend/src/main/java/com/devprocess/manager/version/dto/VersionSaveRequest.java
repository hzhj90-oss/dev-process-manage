package com.devprocess.manager.version.dto;

import javax.validation.constraints.NotBlank;
import javax.validation.constraints.NotNull;
import javax.validation.constraints.Size;
import java.time.LocalDate;
import java.time.LocalDateTime;

public class VersionSaveRequest {
    private Long id;

    @NotNull(message = "所属项目不能为空")
    private Long projectId;

    @NotBlank(message = "版本号不能为空")
    @Size(max = 64, message = "版本号不能超过64个字符")
    private String versionNo;

    @Size(max = 128, message = "版本名称不能超过128个字符")
    private String versionName;

    private String status = "PLANNING";
    private LocalDate plannedStartDate;
    private LocalDate plannedReleaseDate;
    private LocalDateTime releasedAt;
    private String description;

    public Long getId() { return id; }
    public void setId(Long value) { this.id = value; }
    public Long getProjectId() { return projectId; }
    public void setProjectId(Long value) { this.projectId = value; }
    public String getVersionNo() { return versionNo; }
    public void setVersionNo(String value) { this.versionNo = value; }
    public String getVersionName() { return versionName; }
    public void setVersionName(String value) { this.versionName = value; }
    public String getStatus() { return status; }
    public void setStatus(String value) { this.status = value; }
    public LocalDate getPlannedStartDate() { return plannedStartDate; }
    public void setPlannedStartDate(LocalDate value) { this.plannedStartDate = value; }
    public LocalDate getPlannedReleaseDate() { return plannedReleaseDate; }
    public void setPlannedReleaseDate(LocalDate value) { this.plannedReleaseDate = value; }
    public LocalDateTime getReleasedAt() { return releasedAt; }
    public void setReleasedAt(LocalDateTime value) { this.releasedAt = value; }
    public String getDescription() { return description; }
    public void setDescription(String value) { this.description = value; }
}