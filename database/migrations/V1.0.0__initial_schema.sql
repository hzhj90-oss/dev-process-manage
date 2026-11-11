-- Development Process Manager
-- MySQL 5.7.44+
-- Initial schema: V1.0.0
CREATE DATABASE IF NOT EXISTS dev_process_manager
  DEFAULT CHARACTER SET utf8mb4
  COLLATE utf8mb4_general_ci;
USE dev_process_manager;

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

CREATE TABLE IF NOT EXISTS dpm_schema_version (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  version_no VARCHAR(32) NOT NULL,
  description VARCHAR(255) NOT NULL,
  installed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_schema_version (version_no)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS dpm_project (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  project_code VARCHAR(64) NOT NULL,
  project_name VARCHAR(128) NOT NULL,
  description VARCHAR(1000) DEFAULT NULL,
  repository_url VARCHAR(512) DEFAULT NULL,
  main_branch VARCHAR(128) DEFAULT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
  created_by VARCHAR(64) DEFAULT NULL,
  updated_by VARCHAR(64) DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_project_code (project_code),
  KEY idx_project_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS dpm_version (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  project_id BIGINT UNSIGNED NOT NULL,
  version_no VARCHAR(64) NOT NULL,
  version_name VARCHAR(128) DEFAULT NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'PLANNING',
  planned_start_date DATE DEFAULT NULL,
  planned_release_date DATE DEFAULT NULL,
  released_at DATETIME DEFAULT NULL,
  description TEXT,
  created_by VARCHAR(64) DEFAULT NULL,
  updated_by VARCHAR(64) DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_version_project_no (project_id, version_no),
  KEY idx_version_status (status),
  CONSTRAINT fk_version_project FOREIGN KEY (project_id)
    REFERENCES dpm_project (id) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS dpm_environment (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  environment_code VARCHAR(32) NOT NULL,
  environment_name VARCHAR(64) NOT NULL,
  environment_type VARCHAR(24) NOT NULL,
  base_url VARCHAR(512) DEFAULT NULL,
  api_base_url VARCHAR(512) DEFAULT NULL,
  auth_type VARCHAR(32) NOT NULL DEFAULT 'NONE',
  credential_ref VARCHAR(255) DEFAULT NULL,
  config_json JSON DEFAULT NULL,
  description VARCHAR(1000) DEFAULT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  sort_order INT NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_environment_code (environment_code),
  KEY idx_environment_active (is_active, sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS dpm_requirement (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  version_id BIGINT UNSIGNED NOT NULL,
  requirement_no VARCHAR(64) NOT NULL,
  title VARCHAR(255) NOT NULL,
  requirement_type VARCHAR(32) DEFAULT NULL,
  content_markdown LONGTEXT,
  status VARCHAR(24) NOT NULL DEFAULT 'DRAFT',
  priority VARCHAR(16) NOT NULL DEFAULT 'MEDIUM',
  owner_name VARCHAR(64) DEFAULT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  created_by VARCHAR(64) DEFAULT NULL,
  updated_by VARCHAR(64) DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_requirement_version_no (version_id, requirement_no),
  KEY idx_requirement_status (version_id, status),
  CONSTRAINT fk_requirement_version FOREIGN KEY (version_id)
    REFERENCES dpm_version (id) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS dpm_requirement_design (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  requirement_id BIGINT UNSIGNED NOT NULL,
  revision_no INT NOT NULL,
  design_type VARCHAR(32) NOT NULL DEFAULT 'GENERAL',
  title VARCHAR(255) NOT NULL,
  content_markdown LONGTEXT,
  attachment_path VARCHAR(512) DEFAULT NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'DRAFT',
  author_name VARCHAR(64) DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_design_revision (requirement_id, revision_no),
  CONSTRAINT fk_design_requirement FOREIGN KEY (requirement_id)
    REFERENCES dpm_requirement (id) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS dpm_test_script (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  script_code VARCHAR(64) NOT NULL,
  script_name VARCHAR(255) NOT NULL,
  script_language VARCHAR(24) NOT NULL,
  runtime_version VARCHAR(64) DEFAULT NULL,
  source_type VARCHAR(16) NOT NULL DEFAULT 'INLINE',
  source_path VARCHAR(512) DEFAULT NULL,
  source_content MEDIUMTEXT,
  entry_point VARCHAR(255) DEFAULT NULL,
  arguments_json JSON DEFAULT NULL,
  enabled TINYINT(1) NOT NULL DEFAULT 1,
  description VARCHAR(1000) DEFAULT NULL,
  created_by VARCHAR(64) DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_test_script_code (script_code),
  KEY idx_test_script_enabled (enabled)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS dpm_test_case (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  case_no VARCHAR(64) NOT NULL,
  title VARCHAR(255) NOT NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'ACTIVE',
  current_revision_no INT NOT NULL DEFAULT 1,
  owner_name VARCHAR(64) DEFAULT NULL,
  created_by VARCHAR(64) DEFAULT NULL,
  updated_by VARCHAR(64) DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_test_case_no (case_no),
  KEY idx_test_case_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS dpm_test_case_revision (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  test_case_id BIGINT UNSIGNED NOT NULL,
  revision_no INT NOT NULL,
  preconditions LONGTEXT,
  steps_json JSON NOT NULL,
  expected_result LONGTEXT NOT NULL,
  test_type VARCHAR(32) NOT NULL DEFAULT 'FUNCTIONAL',
  priority VARCHAR(16) NOT NULL DEFAULT 'MEDIUM',
  execution_mode VARCHAR(24) NOT NULL DEFAULT 'MANUAL',
  script_id BIGINT UNSIGNED DEFAULT NULL,
  ai_instruction LONGTEXT,
  test_data_json JSON DEFAULT NULL,
  change_note VARCHAR(1000) DEFAULT NULL,
  created_by VARCHAR(64) DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_case_revision (test_case_id, revision_no),
  KEY idx_case_revision_script (script_id),
  CONSTRAINT fk_case_revision_case FOREIGN KEY (test_case_id)
    REFERENCES dpm_test_case (id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_case_revision_script FOREIGN KEY (script_id)
    REFERENCES dpm_test_script (id) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS dpm_requirement_case (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  requirement_id BIGINT UNSIGNED NOT NULL,
  test_case_id BIGINT UNSIGNED NOT NULL,
  coverage_type VARCHAR(24) NOT NULL DEFAULT 'NORMAL',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_requirement_case (requirement_id, test_case_id),
  KEY idx_requirement_case_case (test_case_id),
  CONSTRAINT fk_req_case_requirement FOREIGN KEY (requirement_id)
    REFERENCES dpm_requirement (id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_req_case_case FOREIGN KEY (test_case_id)
    REFERENCES dpm_test_case (id) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS dpm_test_cycle (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  version_id BIGINT UNSIGNED NOT NULL,
  cycle_no INT NOT NULL,
  cycle_name VARCHAR(128) NOT NULL,
  cycle_stage VARCHAR(32) NOT NULL,
  environment_id BIGINT UNSIGNED NOT NULL,
  code_version VARCHAR(128) DEFAULT NULL,
  git_branch VARCHAR(128) DEFAULT NULL,
  git_commit VARCHAR(64) DEFAULT NULL,
  build_no VARCHAR(128) DEFAULT NULL,
  scope_json JSON DEFAULT NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'PLANNED',
  description VARCHAR(2000) DEFAULT NULL,
  started_at DATETIME DEFAULT NULL,
  completed_at DATETIME DEFAULT NULL,
  created_by VARCHAR(64) DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_cycle_version_no (version_id, cycle_no),
  KEY idx_cycle_environment (environment_id),
  KEY idx_cycle_status (version_id, status),
  CONSTRAINT fk_cycle_version FOREIGN KEY (version_id)
    REFERENCES dpm_version (id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_cycle_environment FOREIGN KEY (environment_id)
    REFERENCES dpm_environment (id) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS dpm_cycle_case (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  cycle_id BIGINT UNSIGNED NOT NULL,
  test_case_id BIGINT UNSIGNED NOT NULL,
  test_case_revision_id BIGINT UNSIGNED NOT NULL,
  case_snapshot JSON NOT NULL,
  execution_mode VARCHAR(24) NOT NULL,
  sequence_no INT NOT NULL DEFAULT 0,
  execution_status VARCHAR(24) NOT NULL DEFAULT 'PENDING',
  latest_result VARCHAR(24) NOT NULL DEFAULT 'NOT_RUN',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_cycle_case (cycle_id, test_case_id),
  KEY idx_cycle_case_status (cycle_id, execution_status, latest_result),
  CONSTRAINT fk_cycle_case_cycle FOREIGN KEY (cycle_id)
    REFERENCES dpm_test_cycle (id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_cycle_case_case FOREIGN KEY (test_case_id)
    REFERENCES dpm_test_case (id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_cycle_case_revision FOREIGN KEY (test_case_revision_id)
    REFERENCES dpm_test_case_revision (id) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS dpm_execution_task (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  task_no VARCHAR(64) NOT NULL,
  cycle_id BIGINT UNSIGNED NOT NULL,
  cycle_case_id BIGINT UNSIGNED DEFAULT NULL,
  task_type VARCHAR(32) NOT NULL DEFAULT 'EXECUTE_CASE',
  task_status VARCHAR(24) NOT NULL DEFAULT 'PENDING',
  requested_by VARCHAR(64) DEFAULT NULL,
  executor VARCHAR(64) DEFAULT NULL,
  request_payload JSON DEFAULT NULL,
  result_payload JSON DEFAULT NULL,
  retry_count INT NOT NULL DEFAULT 0,
  heartbeat_at DATETIME DEFAULT NULL,
  started_at DATETIME DEFAULT NULL,
  completed_at DATETIME DEFAULT NULL,
  error_message LONGTEXT,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_execution_task_no (task_no),
  KEY idx_task_cycle_status (cycle_id, task_status),
  KEY idx_task_case (cycle_case_id),
  CONSTRAINT fk_task_cycle FOREIGN KEY (cycle_id)
    REFERENCES dpm_test_cycle (id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_task_cycle_case FOREIGN KEY (cycle_case_id)
    REFERENCES dpm_cycle_case (id) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS dpm_test_execution (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  cycle_case_id BIGINT UNSIGNED NOT NULL,
  task_id BIGINT UNSIGNED DEFAULT NULL,
  attempt_no INT NOT NULL,
  execution_mode VARCHAR(24) NOT NULL,
  runner_type VARCHAR(24) NOT NULL,
  trigger_source VARCHAR(24) NOT NULL DEFAULT 'CHATGPT',
  execution_status VARCHAR(24) NOT NULL DEFAULT 'QUEUED',
  result VARCHAR(24) DEFAULT NULL,
  executor_name VARCHAR(64) DEFAULT NULL,
  expected_result_snapshot LONGTEXT,
  actual_result LONGTEXT,
  request_snapshot JSON DEFAULT NULL,
  response_snapshot JSON DEFAULT NULL,
  generated_script_language VARCHAR(24) DEFAULT NULL,
  generated_script_content MEDIUMTEXT,
  log_excerpt MEDIUMTEXT,
  human_intervention_required TINYINT(1) NOT NULL DEFAULT 0,
  human_intervention_status VARCHAR(24) DEFAULT NULL,
  human_intervention_note LONGTEXT,
  error_message LONGTEXT,
  started_at DATETIME DEFAULT NULL,
  completed_at DATETIME DEFAULT NULL,
  duration_ms BIGINT DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_execution_attempt (cycle_case_id, attempt_no),
  KEY idx_execution_task (task_id),
  KEY idx_execution_result (result, execution_status),
  CONSTRAINT fk_execution_cycle_case FOREIGN KEY (cycle_case_id)
    REFERENCES dpm_cycle_case (id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_execution_task FOREIGN KEY (task_id)
    REFERENCES dpm_execution_task (id) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS dpm_execution_event (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  execution_id BIGINT UNSIGNED NOT NULL,
  event_type VARCHAR(32) NOT NULL,
  event_content LONGTEXT,
  event_data JSON DEFAULT NULL,
  created_by VARCHAR(64) DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_execution_event_time (execution_id, created_at),
  CONSTRAINT fk_execution_event_execution FOREIGN KEY (execution_id)
    REFERENCES dpm_test_execution (id) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS dpm_execution_attachment (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  execution_id BIGINT UNSIGNED NOT NULL,
  attachment_type VARCHAR(24) NOT NULL DEFAULT 'OTHER',
  file_name VARCHAR(255) NOT NULL,
  relative_path VARCHAR(512) NOT NULL,
  mime_type VARCHAR(128) DEFAULT NULL,
  file_size BIGINT DEFAULT NULL,
  sha256 CHAR(64) DEFAULT NULL,
  created_by VARCHAR(64) DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_execution_attachment (execution_id),
  CONSTRAINT fk_execution_attachment_execution FOREIGN KEY (execution_id)
    REFERENCES dpm_test_execution (id) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO dpm_environment
  (environment_code, environment_name, environment_type, description, sort_order)
VALUES
  ('LOCAL', '本地开发环境', 'LOCAL', '本机或开发人员本地部署环境，地址和认证配置后续维护', 10),
  ('TEST3', 'test3测试环境', 'TEST', '集成测试环境，地址和认证配置后续维护', 20),
  ('PRE', '预发环境', 'STAGING', '预发布验证环境，地址和认证配置后续维护', 30),
  ('PROD', '生产环境', 'PROD', '生产环境，默认不允许自动化写操作', 40);

INSERT IGNORE INTO dpm_schema_version (version_no, description)
VALUES ('1.0.0', 'Initial schema for development process management');

SET FOREIGN_KEY_CHECKS = 1;