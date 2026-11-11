package com.devprocess.manager.execution.dto;
public class ExecutionTaskInsertDTO {
 private Long id,cycleId,cycleCaseId,parentTaskId;
 private String taskNo,idempotencyKey,taskType,taskStatus,requestedBy,requestPayloadJson;
 public Long getId(){return id;} public void setId(Long v){id=v;}
 public Long getCycleId(){return cycleId;} public void setCycleId(Long v){cycleId=v;}
 public Long getCycleCaseId(){return cycleCaseId;} public void setCycleCaseId(Long v){cycleCaseId=v;}
 public Long getParentTaskId(){return parentTaskId;} public void setParentTaskId(Long v){parentTaskId=v;}
 public String getTaskNo(){return taskNo;} public void setTaskNo(String v){taskNo=v;}
 public String getIdempotencyKey(){return idempotencyKey;} public void setIdempotencyKey(String v){idempotencyKey=v;}
 public String getTaskType(){return taskType;} public void setTaskType(String v){taskType=v;}
 public String getTaskStatus(){return taskStatus;} public void setTaskStatus(String v){taskStatus=v;}
 public String getRequestedBy(){return requestedBy;} public void setRequestedBy(String v){requestedBy=v;}
 public String getRequestPayloadJson(){return requestPayloadJson;} public void setRequestPayloadJson(String v){requestPayloadJson=v;}
}
