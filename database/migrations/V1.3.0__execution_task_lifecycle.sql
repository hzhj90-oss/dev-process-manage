-- Execution task lifecycle, idempotency, checkpoints and runner lease support.
USE dev_process_manager;

ALTER TABLE dpm_execution_task
  ADD COLUMN parent_task_id BIGINT UNSIGNED DEFAULT NULL AFTER cycle_case_id,
  ADD COLUMN idempotency_key VARCHAR(64) DEFAULT NULL AFTER task_no,
  ADD COLUMN lease_owner VARCHAR(64) DEFAULT NULL AFTER executor,
  ADD COLUMN lease_token_hash CHAR(64) DEFAULT NULL AFTER lease_owner,
  ADD COLUMN lease_expires_at DATETIME DEFAULT NULL AFTER heartbeat_at,
  ADD COLUMN cancel_requested_at DATETIME DEFAULT NULL AFTER completed_at,
  ADD KEY idx_task_parent_status (parent_task_id, task_status),
  ADD KEY idx_task_claim (task_status, task_type, created_at),
  ADD UNIQUE KEY uk_task_cycle_idempotency (cycle_id, idempotency_key),
  ADD CONSTRAINT fk_task_parent FOREIGN KEY (parent_task_id)
    REFERENCES dpm_execution_task (id) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE dpm_test_execution
  ADD COLUMN checkpoint_json JSON DEFAULT NULL AFTER response_snapshot;

ALTER TABLE dpm_execution_event
  ADD COLUMN event_key VARCHAR(64) DEFAULT NULL AFTER event_type,
  ADD UNIQUE KEY uk_execution_event_key (execution_id, event_key);

INSERT INTO dpm_schema_version (version_no, description)
VALUES ('1.3.0', 'Add execution task hierarchy, idempotency, runner lease, checkpoints and event idempotency');
