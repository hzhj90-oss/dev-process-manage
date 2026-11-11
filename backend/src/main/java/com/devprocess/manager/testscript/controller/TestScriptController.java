package com.devprocess.manager.testscript.controller;

import com.devprocess.manager.common.web.PageResult;
import com.devprocess.manager.testscript.dto.*;
import com.devprocess.manager.testscript.service.TestScriptService;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;
import javax.validation.Valid;
import java.util.List;

@RestController
@RequestMapping("/api/test-scripts")
@Validated
public class TestScriptController {
    private final TestScriptService service;

    public TestScriptController(TestScriptService service) {
        this.service = service;
    }

    @GetMapping
    public PageResult<TestScriptSummaryDTO> page(
            @RequestParam(required = false) String keyword,
            @RequestParam(required = false) String language,
            @RequestParam(required = false) Boolean enabled,
            @RequestParam(defaultValue = "1") int pageNum,
            @RequestParam(defaultValue = "10") int pageSize) {
        return service.page(keyword, language, enabled, pageNum, pageSize);
    }

    @GetMapping("/{id}")
    public TestScriptDTO get(@PathVariable Long id) {
        return service.get(id);
    }

    @PostMapping
    public ResponseEntity<TestScriptDTO> create(@Valid @RequestBody ScriptSaveRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(service.create(request));
    }

    @PutMapping("/{id}")
    public TestScriptDTO update(@PathVariable Long id,
            @Valid @RequestBody ScriptSaveRequest request) {
        return service.update(id, request);
    }

    @PutMapping("/{id}/enabled")
    public ResponseEntity<Void> setEnabled(@PathVariable Long id,
            @Valid @RequestBody ScriptEnabledRequest request) {
        service.setEnabled(id, request.getEnabled());
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/{id}/revisions")
    public List<TestScriptRevisionDTO> revisions(@PathVariable Long id) {
        return service.revisions(id);
    }

    @GetMapping("/{id}/revisions/{revisionId}")
    public TestScriptRevisionDTO revision(@PathVariable Long id, @PathVariable Long revisionId) {
        return service.revision(id, revisionId);
    }
}
