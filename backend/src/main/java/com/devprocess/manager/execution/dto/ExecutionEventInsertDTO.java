package com.devprocess.manager.execution.dto;
public class ExecutionEventInsertDTO {
 private Long id,executionId;
 private String eventType,eventKey,eventContent,eventDataJson,createdBy;
 public Long getId(){return id;} public void setId(Long v){id=v;}
 public Long getExecutionId(){return executionId;} public void setExecutionId(Long v){executionId=v;}
 public String getEventType(){return eventType;} public void setEventType(String v){eventType=v;}
 public String getEventKey(){return eventKey;} public void setEventKey(String v){eventKey=v;}
 public String getEventContent(){return eventContent;} public void setEventContent(String v){eventContent=v;}
 public String getEventDataJson(){return eventDataJson;} public void setEventDataJson(String v){eventDataJson=v;}
 public String getCreatedBy(){return createdBy;} public void setCreatedBy(String v){createdBy=v;}
}
