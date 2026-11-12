package com.devprocess.manager.testcase.controller;

import com.devprocess.manager.common.web.PageResult;
import com.devprocess.manager.testcase.dto.*;
import com.devprocess.manager.testcase.service.TestCaseService;
import com.devprocess.manager.testscript.dto.TestScriptDTO;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;

import javax.validation.Valid;
import java.util.List;

@RestController
@RequestMapping("/api/test-cases")
@Validated
public class TestCaseController {
    private final TestCaseService service;

    public TestCaseController(TestCaseService service) {
        this.service = service;
    }

    @GetMapping
    public PageResult<TestCaseDTO> page(
            @RequestParam(required = false) String keyword,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String testType,
            @RequestParam(required = false) String priority,
            @RequestParam(required = false) String executionMode,
            @RequestParam(required = false) Long requirementId,
            @RequestParam(defaultValue = "1") int pageNum,
            @RequestParam(defaultValue = "10") int pageSize) {
        return service.page(keyword, status, testType, priority, executionMode, requirementId, pageNum, pageSize);
    }

    @GetMapping("/available-requirements")
    public List<TestCaseRequirementDTO> availableRequirements(
            @RequestParam(required = false) Long versionId) {
        return service.availableRequirements(versionId);
    }

    /**
     * Lightweight, bounded options for the test-case requirement selector.
     * Keep /available-requirements for existing integrations.
     */
    @GetMapping("/available-requirements/page")
    public PageResult<TestCaseRequirementDTO> availableRequirementsPage(
            @RequestParam(required = false) Long versionId,
            @RequestParam(defaultValue = "1") int pageNum,
            @RequestParam(defaultValue = "100") int pageSize) {
        return service.availableRequirementsPage(versionId, pageNum, pageSize);
    }

    @GetMapping("/scripts")
    public List<TestScriptDTO> scripts() {
        return service.scripts();
    }

    @GetMapping("/{id}")
    public TestCaseDTO get(@PathVariable Long id) {
        return service.get(id);
    }

    @PostMapping
    public ResponseEntity<TestCaseDTO> create(@Valid @RequestBody TestCaseSaveRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(service.create(request));
    }

    @PutMapping("/{id}")
    public TestCaseDTO update(@PathVariable Long id,
            @Valid @RequestBody TestCaseSaveRequest request) {
        return service.update(id, request);
    }

    @GetMapping("/{id}/revisions")
    public List<TestCaseRevisionDTO> revisions(@PathVariable Long id) {
        return service.revisions(id);
    }

    @GetMapping("/{id}/revisions/{revisionId}")
    public TestCaseRevisionDTO getRevision(@PathVariable Long id, @PathVariable Long revisionId) {
        return service.getRevision(id, revisionId);
    }
}