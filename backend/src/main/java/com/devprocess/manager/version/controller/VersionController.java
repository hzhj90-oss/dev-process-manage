package com.devprocess.manager.version.controller;

import com.devprocess.manager.common.web.PageResult;
import com.devprocess.manager.version.dto.VersionDTO;
import com.devprocess.manager.version.dto.VersionSaveRequest;
import com.devprocess.manager.version.service.VersionService;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;
import javax.validation.Valid;

@RestController
@RequestMapping("/api/versions")
@Validated
public class VersionController {
    private final VersionService versionService;

    public VersionController(VersionService versionService) {
        this.versionService = versionService;
    }

    @GetMapping
    public PageResult<VersionDTO> page(
            @RequestParam(required = false) Long projectId,
            @RequestParam(required = false) String keyword,
            @RequestParam(required = false) String status,
            @RequestParam(defaultValue = "1") int pageNum,
            @RequestParam(defaultValue = "10") int pageSize) {
        return versionService.page(projectId, keyword, status, pageNum, pageSize);
    }

    @GetMapping("/{id}")
    public VersionDTO get(@PathVariable Long id) {
        return versionService.get(id);
    }

    @PostMapping
    public ResponseEntity<VersionDTO> create(@Valid @RequestBody VersionSaveRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(versionService.create(request));
    }

    @PutMapping("/{id}")
    public VersionDTO update(@PathVariable Long id,
                             @Valid @RequestBody VersionSaveRequest request) {
        return versionService.update(id, request);
    }
}