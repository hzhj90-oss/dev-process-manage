-- Script revision history and stable test-case script binding.
USE dev_process_manager;

ALTER TABLE dpm_test_script
  ADD COLUMN current_revision_no INT NOT NULL DEFAULT 1 AFTER enabled,
  ADD COLUMN current_revision_id BIGINT UNSIGNED DEFAULT NULL AFTER current_revision_no;

CREATE TABLE dpm_test_script_revision (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  script_id BIGINT UNSIGNED NOT NULL,
  revision_no INT NOT NULL,
  script_version VARCHAR(64) NOT NULL,
  script_language VARCHAR(24) NOT NULL,
  runtime_version VARCHAR(64) DEFAULT NULL,
  source_type VARCHAR(16) NOT NULL DEFAULT 'INLINE',
  source_path VARCHAR(512) DEFAULT NULL,
  source_content MEDIUMTEXT,
  entry_point VARCHAR(255) NOT NULL,
  arguments_json JSON DEFAULT NULL,
  change_note VARCHAR(1000) DEFAULT NULL,
  created_by VARCHAR(64) DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_script_revision (script_id, revision_no),
  KEY idx_script_revision_version (script_id, script_version),
  CONSTRAINT fk_script_revision_script FOREIGN KEY (script_id)
    REFERENCES dpm_test_script (id) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO dpm_test_script_revision
  (script_id, revision_no, script_version, script_language, runtime_version,
   source_type, source_path, source_content, entry_point, arguments_json, created_by)
SELECT id, 1, '1.0.0', script_language, runtime_version,
       source_type, source_path, source_content, COALESCE(entry_point, 'main'),
       arguments_json, created_by
FROM dpm_test_script;

UPDATE dpm_test_script s
INNER JOIN dpm_test_script_revision r
  ON r.script_id = s.id AND r.revision_no = 1
SET s.current_revision_id = r.id;

ALTER TABLE dpm_test_script
  ADD CONSTRAINT fk_test_script_current_revision FOREIGN KEY (current_revision_id)
    REFERENCES dpm_test_script_revision (id) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE dpm_test_case_revision
  ADD COLUMN script_revision_id BIGINT UNSIGNED DEFAULT NULL AFTER script_id;

UPDATE dpm_test_case_revision cr
INNER JOIN dpm_test_script s ON s.id = cr.script_id
SET cr.script_revision_id = s.current_revision_id
WHERE cr.script_id IS NOT NULL;

ALTER TABLE dpm_test_case_revision
  ADD CONSTRAINT fk_case_revision_script_revision FOREIGN KEY (script_revision_id)
    REFERENCES dpm_test_script_revision (id) ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO dpm_schema_version (version_no, description)
VALUES ('1.1.0', 'Add immutable test script revision history and test-case script revision binding');
