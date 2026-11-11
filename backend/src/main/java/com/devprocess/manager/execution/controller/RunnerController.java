package com.devprocess.manager.execution.controller;

import com.devprocess.manager.execution.dto.ExecutionCompleteRequest;
import com.devprocess.manager.execution.dto.ExecutionEventRequest;
import com.devprocess.manager.execution.dto.RunnerClaimRequest;
import com.devprocess.manager.execution.dto.RunnerFailureRequest;
import com.devprocess.manager.execution.service.RunnerService;
import org.springframework.web.bind.annotation.*;
import javax.validation.Valid;
import java.util.Map;

@RestController
@RequestMapping("/api/runner")
public class RunnerController {
    private final RunnerService service;

    public RunnerController(RunnerService service) {
        this.service = service;
    }

    @PostMapping("/claim")
    public Map<String, Object> claim(
            @RequestHeader(value = "X-DPM-Runner-Token", required = false) String token,
            @Valid @RequestBody RunnerClaimRequest request) {
        return service.claim(token, request);
    }
    @PostMapping("/tasks/{taskId}/heartbeat")
    public Map<String, Object> heartbeat(@PathVariable Long taskId,
            @RequestHeader("X-DPM-Runner-Id") String runnerId,
            @RequestHeader("X-DPM-Lease-Token") String leaseToken) {
        return service.heartbeat(taskId, runnerId, leaseToken);
    }

    @PostMapping("/tasks/{taskId}/events")
    public Map<String, Object> addEvent(@PathVariable Long taskId,
            @RequestHeader("X-DPM-Runner-Id") String runnerId,
            @RequestHeader("X-DPM-Lease-Token") String leaseToken,
            @Valid @RequestBody ExecutionEventRequest request) {
        return service.addEvent(taskId, runnerId, leaseToken, request);
    }

    @PostMapping("/tasks/{taskId}/complete")
    public Map<String, Object> complete(@PathVariable Long taskId,
            @RequestHeader("X-DPM-Runner-Id") String runnerId,
            @RequestHeader("X-DPM-Lease-Token") String leaseToken,
            @Valid @RequestBody ExecutionCompleteRequest request) {
        return service.complete(taskId, runnerId, leaseToken, request);
    }
    @PostMapping("/tasks/{taskId}/fail")
    public Map<String, Object> fail(@PathVariable Long taskId,
            @RequestHeader("X-DPM-Runner-Id") String runnerId,
            @RequestHeader("X-DPM-Lease-Token") String leaseToken,
            @Valid @RequestBody RunnerFailureRequest request) {
        return service.fail(taskId, runnerId, leaseToken, request);
    }
}
