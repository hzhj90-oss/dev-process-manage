package com.devprocess.manager.testcycle.dto;

import javax.validation.constraints.NotEmpty;
import javax.validation.constraints.Size;
import java.util.List;

public class TestCycleCasesRequest {
    @NotEmpty @Size(max = 500)
    private List<Long> caseIds;

    public List<Long> getCaseIds() { return caseIds; }
    public void setCaseIds(List<Long> v) { caseIds = v; }
}
