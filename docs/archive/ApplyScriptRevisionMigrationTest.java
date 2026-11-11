package com.devprocess.manager;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.core.io.FileSystemResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.init.ResourceDatabasePopulator;

import javax.sql.DataSource;

/**
 * One-time local migration runner. Execute explicitly with the local config path.
 * Remove this test after migration verification; it is not part of normal CI.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.NONE)
class ApplyScriptRevisionMigrationTest {
    @Autowired
    private DataSource dataSource;

    @Test
    void applyV110IfMissing() {
        JdbcTemplate jdbc = new JdbcTemplate(dataSource);
        Integer installed = jdbc.queryForObject(
                "SELECT COUNT(1) FROM dpm_schema_version WHERE version_no = '1.1.0'",
                Integer.class);
        if (installed != null && installed > 0) {
            return;
        }
        ResourceDatabasePopulator populator = new ResourceDatabasePopulator(
                new FileSystemResource("D:/code/dev-process-manager/database/migrations/V1.1.0__script_revision_history.sql"));
        populator.setContinueOnError(false);
        populator.execute(dataSource);
        Integer verified = jdbc.queryForObject(
                "SELECT COUNT(1) FROM dpm_schema_version WHERE version_no = '1.1.0'",
                Integer.class);
        if (verified == null || verified != 1) {
            throw new IllegalStateException("Schema migration 1.1.0 was not recorded.");
        }
    }
}
