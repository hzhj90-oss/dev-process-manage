package com.devprocess.manager.testcycle.controller;

import com.devprocess.manager.common.web.PageResult;
import com.devprocess.manager.testcycle.dto.*;
import com.devprocess.manager.testcycle.service.TestCycleService;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;
import javax.validation.Valid;

@RestController
@RequestMapping("/api/test-cycles")
@Validated
public class TestCycleController {
    private final TestCycleService service;

    public TestCycleController(TestCycleService service) {
        this.service = service;
    }

    @GetMapping
    public PageResult<TestCycleSummaryDTO> page(
            @RequestParam(required = false) Long versionId,
            @RequestParam(required = false) Long environmentId,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String keyword,
            @RequestParam(defaultValue = "1") int pageNum,
            @RequestParam(defaultValue = "10") int pageSize) {
        return service.page(versionId, environmentId, status, keyword, pageNum, pageSize);
    }

    @GetMapping("/{id}")
    public TestCycleDTO get(@PathVariable Long id) {
        return service.get(id);
    }

    @PostMapping
    public ResponseEntity<TestCycleDTO> create(@Valid @RequestBody TestCycleSaveRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(service.create(request));
    }

    @PutMapping("/{id}")
    public TestCycleDTO update(@PathVariable Long id,
            @Valid @RequestBody TestCycleUpdateRequest request) {
        return service.update(id, request);
    }

    @PostMapping("/{id}/cases")
    public TestCycleDTO addCases(@PathVariable Long id,
            @Valid @RequestBody TestCycleCasesRequest request) {
        return service.addCases(id, request);
    }

    @DeleteMapping("/{id}/cases/{cycleCaseId}")
    public TestCycleDTO removeCase(@PathVariable Long id, @PathVariable Long cycleCaseId) {
        return service.removeCase(id, cycleCaseId);
    }

    @PostMapping("/{id}/start")
    public TestCycleDTO start(@PathVariable Long id) {
        return service.start(id);
    }

    @PostMapping("/{id}/abort")
    public TestCycleDTO abort(@PathVariable Long id) {
        return service.abort(id);
    }
}
