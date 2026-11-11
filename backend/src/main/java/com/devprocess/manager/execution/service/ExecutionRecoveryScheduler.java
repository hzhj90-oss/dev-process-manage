package com.devprocess.manager.execution.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
@ConditionalOnProperty(prefix = "execution.recovery", name = "enabled", havingValue = "true")
public class ExecutionRecoveryScheduler {
    private static final Logger LOGGER = LoggerFactory.getLogger(ExecutionRecoveryScheduler.class);

    private final ExecutionTaskService service;

    public ExecutionRecoveryScheduler(ExecutionTaskService service) {
        this.service = service;
    }

    @Scheduled(fixedDelayString = "${execution.recovery.scan-interval-ms:60000}")
    public void recoverStaleExecutions() {
        int recovered = service.recoverStaleTasks();
        if (recovered > 0) {
            LOGGER.warn("Marked {} stale execution tasks as RECOVERY_REQUIRED", recovered);
        }
    }
}
