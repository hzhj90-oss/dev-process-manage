package com.devprocess.manager.execution.dto;
import javax.validation.constraints.NotBlank;
import javax.validation.constraints.Size;
public class HumanInterventionRequest {
 @NotBlank @Size(max=24) private String decision;
 @Size(max=4000) private String note;
 @Size(max=64) private String decidedBy;
 public String getDecision(){return decision;}
 public void setDecision(String v){decision=v;}
 public String getNote(){return note;}
 public void setNote(String v){note=v;}
 public String getDecidedBy(){return decidedBy;}
 public void setDecidedBy(String v){decidedBy=v;}
}
