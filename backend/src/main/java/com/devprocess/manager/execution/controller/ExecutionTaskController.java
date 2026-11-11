package com.devprocess.manager.execution.controller;

import com.devprocess.manager.common.web.PageResult;
import com.devprocess.manager.execution.dto.ExecutionAttachmentFile;
import com.devprocess.manager.execution.dto.ExecutionCompleteRequest;
import com.devprocess.manager.execution.dto.ExecutionEventRequest;
import com.devprocess.manager.execution.dto.ExecutionTaskCreateRequest;
import com.devprocess.manager.execution.dto.ExecutionTaskStartRequest;
import com.devprocess.manager.execution.dto.HumanInterventionRequest;
import com.devprocess.manager.execution.service.ExecutionAttachmentService;
import com.devprocess.manager.execution.service.ExecutionTaskService;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;

import javax.validation.Valid;
import java.nio.charset.StandardCharsets;
import java.util.Collections;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api")
@Validated
public class ExecutionTaskController {
    private final ExecutionTaskService service;
    private final ExecutionAttachmentService attachmentService;

    public ExecutionTaskController(ExecutionTaskService service,
            ExecutionAttachmentService attachmentService) {
        this.service = service;
        this.attachmentService = attachmentService;
    }

    @GetMapping("/execution-tasks")
    public PageResult<Map<String, Object>> page(
            @RequestParam(required = false) String status,
            @RequestParam(required = false) Long cycleId,
            @RequestParam(required = false) String keyword,
            @RequestParam(defaultValue = "1") int pageNum,
            @RequestParam(defaultValue = "10") int pageSize) {
        return service.page(status, cycleId, keyword, pageNum, pageSize);
    }

    /**
     * Returns queued AI cases for ChatGPT to execute. The subsequent start endpoint
     * performs the atomic claim and rejects stale or concurrently claimed candidates.
     */
    @GetMapping("/execution-tasks/claimable/chatgpt")
    public List<Map<String, Object>> chatGptQueue(
            @RequestParam(defaultValue = "10") int limit) {
        return service.chatGptQueue(limit);
    }

    @GetMapping("/execution-tasks/{id}")
    public Map<String, Object> get(@PathVariable Long id) {
        return service.get(id);
    }

    @PostMapping("/test-cycles/{cycleId}/execution-tasks")
    public ResponseEntity<Map<String, Object>> createCycleTask(
            @PathVariable Long cycleId,
            @Valid @RequestBody ExecutionTaskCreateRequest request,
            @RequestHeader(value = "Idempotency-Key", required = false) String idempotencyKey) {
        if (idempotencyKey != null && !idempotencyKey.trim().isEmpty()) {
            request.setIdempotencyKey(idempotencyKey.trim());
        }
        return ResponseEntity.status(HttpStatus.CREATED).body(service.createCycleTask(cycleId, request));
    }

    @PostMapping("/test-cycles/{cycleId}/cycle-cases/{cycleCaseId}/execution-tasks")
    public ResponseEntity<Map<String, Object>> createCaseTask(
            @PathVariable Long cycleId, @PathVariable Long cycleCaseId,
            @Valid @RequestBody ExecutionTaskCreateRequest request,
            @RequestHeader(value = "Idempotency-Key", required = false) String idempotencyKey) {
        if (idempotencyKey != null && !idempotencyKey.trim().isEmpty()) {
            request.setIdempotencyKey(idempotencyKey.trim());
        }
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(service.createCaseTask(cycleId, cycleCaseId, request));
    }

    @PostMapping("/execution-tasks/{id}/cancel")
    public Map<String, Object> cancel(@PathVariable Long id,
            @RequestBody(required = false) Map<String, String> request) {
        Map<String, String> body = request == null ? Collections.<String, String>emptyMap() : request;
        return service.cancel(id, body.get("note"), body.get("cancelledBy"));
    }

    @PostMapping("/execution-tasks/{id}/resume")
    public Map<String, Object> resume(@PathVariable Long id,
            @RequestParam(defaultValue = "local-user") String requestedBy) {
        return service.resume(id, requestedBy);
    }

    @PostMapping("/execution-tasks/{id}/human-intervention")
    public Map<String, Object> humanIntervention(@PathVariable Long id,
            @Valid @RequestBody HumanInterventionRequest request) {
        return service.humanIntervention(id, request);
    }

    @PostMapping("/execution-tasks/{id}/executions/{executionId}/start")
    public Map<String, Object> start(@PathVariable Long id, @PathVariable Long executionId,
            @Valid @RequestBody ExecutionTaskStartRequest request) {
        return service.start(id, executionId, request);
    }

    @PostMapping("/execution-tasks/{id}/executions/{executionId}/events")
    public Map<String, Object> addEvent(@PathVariable Long id, @PathVariable Long executionId,
            @Valid @RequestBody ExecutionEventRequest request) {
        return service.addEvent(id, executionId, request);
    }

    @PostMapping("/execution-tasks/{id}/executions/{executionId}/complete")
    public Map<String, Object> complete(@PathVariable Long id, @PathVariable Long executionId,
            @Valid @RequestBody ExecutionCompleteRequest request) {
        return service.complete(id, executionId, request);
    }

    @PostMapping(value = "/execution-tasks/{id}/executions/{executionId}/attachments",
            consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<Map<String, Object>> uploadAttachment(
            @PathVariable Long id, @PathVariable Long executionId,
            @RequestPart("file") MultipartFile file,
            @RequestParam(defaultValue = "OTHER") String type,
            @RequestParam(defaultValue = "local-user") String createdBy) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(attachmentService.upload(id, executionId, file, type, createdBy));
    }

    @GetMapping("/execution-tasks/{id}/executions/{executionId}/attachments/{attachmentId}")
    public ResponseEntity<Resource> downloadAttachment(
            @PathVariable Long id, @PathVariable Long executionId, @PathVariable Long attachmentId) {
        ExecutionAttachmentFile attachment = attachmentService.download(id, executionId, attachmentId);
        ContentDisposition disposition = ContentDisposition.attachment()
                .filename(attachment.getFileName(), StandardCharsets.UTF_8).build();
        MediaType mediaType = MediaType.parseMediaType(attachment.getMimeType());
        return ResponseEntity.ok()
                .contentType(mediaType)
                .contentLength(attachment.getFileSize())
                .header(HttpHeaders.CONTENT_DISPOSITION, disposition.toString())
                .header("X-Content-Type-Options", "nosniff")
                .body(new FileSystemResource(attachment.getPath()));
    }
}
