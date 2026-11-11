package com.devprocess.manager.testscript.dto;

import javax.validation.constraints.NotNull;

public class ScriptEnabledRequest {
    @NotNull
    private Boolean enabled;
    public Boolean getEnabled() { return enabled; }
    public void setEnabled(Boolean value) { enabled = value; }
}
