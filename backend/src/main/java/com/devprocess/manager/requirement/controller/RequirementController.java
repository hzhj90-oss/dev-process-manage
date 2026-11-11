package com.devprocess.manager.requirement.controller;

import com.devprocess.manager.common.web.PageResult;
import com.devprocess.manager.requirement.dto.*;
import com.devprocess.manager.requirement.service.RequirementService;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;
import javax.validation.Valid;
import java.util.List;

@RestController
@RequestMapping("/api/requirements")
@Validated
public class RequirementController {
    private final RequirementService service;
    public RequirementController(RequirementService service) { this.service = service; }

    @GetMapping
    public PageResult<RequirementDTO> page(@RequestParam(required = false) Long versionId,
            @RequestParam(required = false) String keyword, @RequestParam(required = false) String status,
            @RequestParam(required = false) String priority,
            @RequestParam(defaultValue = "1") int pageNum,
            @RequestParam(defaultValue = "10") int pageSize) {
        return service.page(versionId, keyword, status, priority, pageNum, pageSize);
    }

    @GetMapping("/{id}")
    public RequirementDTO get(@PathVariable Long id) { return service.get(id); }

    @PostMapping
    public ResponseEntity<RequirementDTO> create(@Valid @RequestBody RequirementSaveRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(service.create(request));
    }

    @PutMapping("/{id}")
    public RequirementDTO update(@PathVariable Long id, @Valid @RequestBody RequirementSaveRequest request) {
        return service.update(id, request);
    }
    @GetMapping("/{id}/designs")
    public List<RequirementDesignDTO> designs(@PathVariable Long id) {
        return service.designs(id);
    }

    @GetMapping("/{id}/designs/{designId}")
    public RequirementDesignDTO getDesign(@PathVariable Long id, @PathVariable Long designId) {
        return service.getDesign(id, designId);
    }

    @PostMapping("/{id}/designs")
    public ResponseEntity<RequirementDesignDTO> createDesign(@PathVariable Long id,
            @Valid @RequestBody RequirementDesignSaveRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(service.createDesign(id, request));
    }
}
