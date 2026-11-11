package com.devprocess.manager.execution.dto;
import javax.validation.constraints.NotBlank;
import javax.validation.constraints.Size;
public class ExecutionTaskStartRequest {
 @NotBlank private String actor;
 @Size(max=64) private String executorName;
 public String getActor(){return actor;}
 public void setActor(String v){actor=v;}
 public String getExecutorName(){return executorName;}
 public void setExecutorName(String v){executorName=v;}
}
