package com.devprocess.manager.environment.controller;

import com.devprocess.manager.environment.dto.EnvironmentDTO;
import com.devprocess.manager.environment.dto.EnvironmentSaveRequest;
import com.devprocess.manager.environment.service.EnvironmentService;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;
import javax.validation.Valid;
import java.util.List;

@RestController
@RequestMapping("/api/environments")
@Validated
public class EnvironmentController {
    private final EnvironmentService service;

    public EnvironmentController(EnvironmentService service) {
        this.service = service;
    }

    @GetMapping
    public List<EnvironmentDTO> list(
            @RequestParam(required = false, defaultValue = "false") Boolean activeOnly) {
        return service.list(activeOnly);
    }

    @GetMapping("/{id}")
    public EnvironmentDTO get(@PathVariable Long id) {
        return service.get(id);
    }

    @PostMapping
    public ResponseEntity<EnvironmentDTO> create(@Valid @RequestBody EnvironmentSaveRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(service.create(request));
    }

    @PutMapping("/{id}")
    public EnvironmentDTO update(@PathVariable Long id,
            @Valid @RequestBody EnvironmentSaveRequest request) {
        return service.update(id, request);
    }
}
