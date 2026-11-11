package com.devprocess.manager.execution.dto;
import javax.validation.constraints.Size;
public class ExecutionTaskCreateRequest {
 @Size(max=64) private String idempotencyKey;
 @Size(max=64) private String requestedBy;
 @Size(max=24) private String triggerSource;
 public String getIdempotencyKey(){return idempotencyKey;}
 public void setIdempotencyKey(String v){idempotencyKey=v;}
 public String getRequestedBy(){return requestedBy;}
 public void setRequestedBy(String v){requestedBy=v;}
 public String getTriggerSource(){return triggerSource;}
 public void setTriggerSource(String v){triggerSource=v;}
}
