package com.devprocess.manager.project.controller;

import com.devprocess.manager.common.web.PageResult;
import com.devprocess.manager.project.dto.ProjectDTO;
import com.devprocess.manager.project.dto.ProjectSaveRequest;
import com.devprocess.manager.project.service.ProjectService;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;
import javax.validation.Valid;

@RestController
@RequestMapping("/api/projects")
@Validated
public class ProjectController {
    private final ProjectService projectService;

    public ProjectController(ProjectService projectService) {
        this.projectService = projectService;
    }

    @GetMapping
    public PageResult<ProjectDTO> page(
            @RequestParam(required = false) String keyword,
            @RequestParam(required = false) String status,
            @RequestParam(defaultValue = "1") int pageNum,
            @RequestParam(defaultValue = "10") int pageSize) {
        return projectService.page(keyword, status, pageNum, pageSize);
    }

    @GetMapping("/{id}")
    public ProjectDTO get(@PathVariable Long id) {
        return projectService.get(id);
    }

    @PostMapping
    public ResponseEntity<ProjectDTO> create(@Valid @RequestBody ProjectSaveRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(projectService.create(request));
    }

    @PutMapping("/{id}")
    public ProjectDTO update(@PathVariable Long id,
                             @Valid @RequestBody ProjectSaveRequest request) {
        return projectService.update(id, request);
    }
}