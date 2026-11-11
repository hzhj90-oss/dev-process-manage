-- Snapshot the environment and requirement coverage used by each test cycle.
USE dev_process_manager;

ALTER TABLE dpm_test_cycle
  ADD COLUMN environment_snapshot JSON DEFAULT NULL AFTER environment_id;

CREATE TABLE dpm_cycle_case_requirement (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  cycle_case_id BIGINT UNSIGNED NOT NULL,
  requirement_id BIGINT UNSIGNED NOT NULL,
  coverage_type VARCHAR(24) NOT NULL DEFAULT 'NORMAL',
  requirement_snapshot JSON NOT NULL,
  design_snapshot JSON DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_cycle_case_requirement (cycle_case_id, requirement_id),
  KEY idx_cycle_case_requirement_requirement (requirement_id),
  CONSTRAINT fk_cycle_case_requirement_case
    FOREIGN KEY (cycle_case_id) REFERENCES dpm_cycle_case (id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_cycle_case_requirement_requirement
    FOREIGN KEY (requirement_id) REFERENCES dpm_requirement (id)
    ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO dpm_schema_version (version_no, description)
VALUES ('1.2.0', 'Add immutable environment and requirement coverage snapshots for test cycles');
