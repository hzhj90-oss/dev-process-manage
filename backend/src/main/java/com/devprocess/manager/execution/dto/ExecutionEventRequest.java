package com.devprocess.manager.execution.dto;

import javax.validation.constraints.NotBlank;
import javax.validation.constraints.Size;

public class ExecutionEventRequest {
    @NotBlank @Size(max = 64)
    private String eventKey;
    @NotBlank @Size(max = 32)
    private String eventType;
    @Size(max = 4000)
    private String eventContent;
    @Size(max = 200000)
    private String eventDataJson;
    @Size(max = 64)
    private String createdBy;

    public String getEventKey() { return eventKey; }
    public void setEventKey(String value) { eventKey = value; }
    public String getEventType() { return eventType; }
    public void setEventType(String value) { eventType = value; }
    public String getEventContent() { return eventContent; }
    public void setEventContent(String value) { eventContent = value; }
    public String getEventDataJson() { return eventDataJson; }
    public void setEventDataJson(String value) { eventDataJson = value; }
    public String getCreatedBy() { return createdBy; }
    public void setCreatedBy(String value) { createdBy = value; }
}
