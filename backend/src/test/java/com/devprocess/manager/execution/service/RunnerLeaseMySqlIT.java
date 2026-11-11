package com.devprocess.manager.execution.service;

import com.devprocess.manager.execution.mapper.ExecutionTaskMapper;
import org.apache.ibatis.builder.xml.XMLMapperBuilder;
import org.apache.ibatis.datasource.unpooled.UnpooledDataSource;
import org.apache.ibatis.mapping.Environment;
import org.apache.ibatis.session.Configuration;
import org.apache.ibatis.session.SqlSession;
import org.apache.ibatis.session.SqlSessionFactory;
import org.apache.ibatis.session.SqlSessionFactoryBuilder;
import org.apache.ibatis.transaction.jdbc.JdbcTransactionFactory;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.Assumptions;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.StringReader;
import java.nio.charset.StandardCharsets;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.Statement;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

import static org.junit.jupiter.api.Assertions.*;

class RunnerLeaseMySqlIT {
    private String jdbcUrl;
    private String username;
    private String password;
    private String tableName;
    private String cycleTableName;
    private String cycleCaseTableName;
    private UnpooledDataSource dataSource;
    private SqlSessionFactory sqlSessionFactory;

    @BeforeEach
    void setUp() throws Exception {
        jdbcUrl = System.getenv("DPM_IT_MYSQL_URL");
        username = System.getenv("DPM_IT_MYSQL_USERNAME");
        password = System.getenv("DPM_IT_MYSQL_PASSWORD");
        Assumptions.assumeTrue(hasText(jdbcUrl) && hasText(username) && password != null,
                "Set DPM_IT_MYSQL_URL/USERNAME/PASSWORD to run the opt-in MySQL integration test.");

        Class.forName("com.mysql.cj.jdbc.Driver");
        String suffix = UUID.randomUUID().toString().replace("-", "");
        tableName = "dpm_it_lease_" + suffix;
        cycleTableName = "dpm_it_cycle_" + suffix;
        cycleCaseTableName = "dpm_it_cycle_case_" + suffix;
        createIsolatedTable();
        dataSource = new UnpooledDataSource("com.mysql.cj.jdbc.Driver", jdbcUrl, username, password);
        Configuration configuration = new Configuration(
                new Environment("runner-lease-mysql-it", new JdbcTransactionFactory(), dataSource));
        configuration.setMapUnderscoreToCamelCase(true);
        String mapperXml = loadMapperXml()
                .replace("dpm_execution_task", tableName)
                .replace("dpm_test_cycle", cycleTableName)
                .replace("dpm_cycle_case", cycleCaseTableName);
        XMLMapperBuilder parser = new XMLMapperBuilder(new StringReader(mapperXml), configuration,
                "mapper/execution/ExecutionTaskMapper.xml#mysql-it", configuration.getSqlFragments());
        parser.parse();
        if (!configuration.hasMapper(ExecutionTaskMapper.class)) {
            configuration.addMapper(ExecutionTaskMapper.class);
        }
        sqlSessionFactory = new SqlSessionFactoryBuilder().build(configuration);
    }

    @AfterEach
    void tearDown() throws Exception {
        if (tableName != null && hasText(jdbcUrl) && hasText(username) && password != null) {
            try (Connection connection = DriverManager.getConnection(jdbcUrl, username, password);
                 Statement statement = connection.createStatement()) {
                if (cycleCaseTableName != null) statement.execute("DROP TABLE IF EXISTS " + cycleCaseTableName);
                if (cycleTableName != null) statement.execute("DROP TABLE IF EXISTS " + cycleTableName);
                statement.execute("DROP TABLE IF EXISTS " + tableName);
            }
        }
    }

    @Test
    void databaseClockMustClassifyFutureBoundaryAndExpiredLeasesWithoutAGap() throws Exception {
        try (SqlSession session = sqlSessionFactory.openSession(true)) {
            ExecutionTaskMapper mapper = session.getMapper(ExecutionTaskMapper.class);
            insertTask(session, 1L, "DATE_ADD(NOW(), INTERVAL 60 SECOND)");
            insertTask(session, 2L, "NOW()");
            insertTask(session, 3L, "DATE_SUB(NOW(), INTERVAL 1 SECOND)");

            Set<Long> staleIds = new HashSet<Long>();
            for (Map<String, Object> row : mapper.selectStaleTasks()) {
                staleIds.add(((Number) row.get("id")).longValue());
            }
            assertFalse(staleIds.contains(1L), "A future lease must not be selected for recovery.");
            assertTrue(staleIds.contains(2L), "A lease expiring exactly at NOW() must be stale.");
            assertTrue(staleIds.contains(3L), "An already expired lease must be stale.");

            assertEquals(1, mapper.updateTaskLeaseHeartbeat(1L, "runner-it", "hash-it", 60));
            assertEquals(0, mapper.updateTaskRecoveryRequired(1L, "must remain running"));
            assertEquals(0, mapper.updateTaskLeaseHeartbeat(2L, "runner-it", "hash-it", 60));
            assertEquals(1, mapper.updateTaskRecoveryRequired(2L, "expired at database boundary"));
            assertEquals(0, mapper.updateTaskLeaseHeartbeat(3L, "runner-it", "hash-it", 60));
            assertEquals(1, mapper.updateTaskRecoveryRequired(3L, "already expired"));
        }
    }

    @Test
    void heartbeatAndRecoveryUpdatesMustSerializeOnTheTaskRow() throws Exception {
        insertTaskWithId(10L, "DATE_SUB(NOW(), INTERVAL 1 SECOND)");
        insertTaskWithId(11L, "DATE_ADD(NOW(), INTERVAL 60 SECOND)");
        ExecutorService executor = Executors.newFixedThreadPool(2);
        try {
            assertRecoveryWinsAgainstLateHeartbeat(10L, executor);
            assertHeartbeatWinsAgainstRecoveryUpdate(11L, executor);
        } finally {
            executor.shutdownNow();
            executor.awaitTermination(5, TimeUnit.SECONDS);
        }
    }
    @Test
    void cycleMustCompleteOnlyAfterEveryCaseIsTerminal() throws Exception {
        try (SqlSession session = sqlSessionFactory.openSession(true)) {
            ExecutionTaskMapper mapper = session.getMapper(ExecutionTaskMapper.class);
            insertCycle(session, 1L, "RUNNING");
            insertCycleCase(session, 11L, 1L, "PENDING");
            insertCycleCase(session, 12L, 1L, "PENDING");

            assertEquals(0, mapper.completeCycleIfAllCasesTerminal(1L));
            mapper.updateCycleCase(11L, "COMPLETED", "PASS");
            assertEquals(0, mapper.completeCycleIfAllCasesTerminal(1L),
                    "A cycle must remain RUNNING while any case is pending.");

            mapper.updateCycleCase(12L, "COMPLETED", "SKIPPED");
            assertEquals(1, mapper.completeCycleIfAllCasesTerminal(1L));
            assertEquals(0, mapper.completeCycleIfAllCasesTerminal(1L),
                    "Completing an already completed cycle must be idempotent.");

            try (Statement statement = session.getConnection().createStatement();
                 java.sql.ResultSet result = statement.executeQuery(
                         "SELECT status, completed_at FROM " + cycleTableName + " WHERE id = 1")) {
                assertTrue(result.next());
                assertEquals("COMPLETED", result.getString("status"));
                assertNotNull(result.getTimestamp("completed_at"));
            }
        }
    }

    @Test
    void cycleCompletionMustIgnoreAbortedAndEmptyCycles() throws Exception {
        try (SqlSession session = sqlSessionFactory.openSession(true)) {
            ExecutionTaskMapper mapper = session.getMapper(ExecutionTaskMapper.class);
            insertCycle(session, 2L, "ABORTED");
            insertCycle(session, 3L, "RUNNING");
            insertCycle(session, 5L, "RUNNING");
            insertCycleCase(session, 31L, 2L, "CANCELLED");
            insertCycleCase(session, 51L, 5L, "CANCELLED");

            assertEquals(0, mapper.completeCycleIfAllCasesTerminal(2L),
                    "An aborted cycle must preserve its ABORTED status.");
            assertEquals(0, mapper.completeCycleIfAllCasesTerminal(3L),
                    "A cycle with no captured cases must not complete automatically.");
            assertEquals(1, mapper.completeCycleIfAllCasesTerminal(5L),
                    "Cancelled cases are terminal and can finish a running cycle.");
        }
    }

    @Test
    void concurrentLastCaseCompletionsMustSerializeOnTheCycleRow() throws Exception {
        insertCycleWithCases(4L, 41L, 42L);
        ExecutorService executor = Executors.newSingleThreadExecutor();
        try (SqlSession first = sqlSessionFactory.openSession(false)) {
            try (Statement statement = first.getConnection().createStatement();
                 java.sql.ResultSet result = statement.executeQuery(
                         "SELECT id FROM " + cycleTableName + " WHERE id = 4 FOR UPDATE")) {
                assertTrue(result.next());
            }
            CountDownLatch secondStarted = new CountDownLatch(1);
            Future<Integer> secondCompletion = executor.submit(() -> {
                secondStarted.countDown();
                try (SqlSession second = sqlSessionFactory.openSession(false)) {
                    try (Statement statement = second.getConnection().createStatement();
                         java.sql.ResultSet result = statement.executeQuery(
                                 "SELECT id FROM " + cycleTableName + " WHERE id = 4 FOR UPDATE")) {
                        assertTrue(result.next());
                    }
                    ExecutionTaskMapper mapper = second.getMapper(ExecutionTaskMapper.class);
                    mapper.updateCycleCase(42L, "COMPLETED", "FAIL");
                    int completed = mapper.completeCycleIfAllCasesTerminal(4L);
                    second.commit();
                    return completed;
                }
            });
            assertTrue(secondStarted.await(2, TimeUnit.SECONDS));

            ExecutionTaskMapper firstMapper = first.getMapper(ExecutionTaskMapper.class);
            firstMapper.updateCycleCase(41L, "COMPLETED", "PASS");
            first.commit();

            assertEquals(Integer.valueOf(1), secondCompletion.get(5, TimeUnit.SECONDS));
        } finally {
            executor.shutdownNow();
            executor.awaitTermination(5, TimeUnit.SECONDS);
        }
    }

    private void insertCycleWithCases(Long cycleId, Long firstCaseId, Long secondCaseId) throws Exception {
        try (SqlSession session = sqlSessionFactory.openSession(true)) {
            insertCycle(session, cycleId, "RUNNING");
            insertCycleCase(session, firstCaseId, cycleId, "PENDING");
            insertCycleCase(session, secondCaseId, cycleId, "PENDING");
        }
    }

    private void insertCycle(SqlSession session, Long cycleId, String status) throws Exception {
        try (Statement statement = session.getConnection().createStatement()) {
            statement.execute("INSERT INTO " + cycleTableName
                    + " (id, status) VALUES (" + cycleId + ", '" + status + "')");
        }
    }

    private void insertCycleCase(SqlSession session, Long caseId, Long cycleId, String status) throws Exception {
        try (Statement statement = session.getConnection().createStatement()) {
            statement.execute("INSERT INTO " + cycleCaseTableName
                    + " (id, cycle_id, execution_status) VALUES ("
                    + caseId + ", " + cycleId + ", '" + status + "')");
        }
    }

    private void assertRecoveryWinsAgainstLateHeartbeat(Long taskId, ExecutorService executor) throws Exception {
        try (SqlSession lockSession = sqlSessionFactory.openSession(false)) {
            ExecutionTaskMapper lockedMapper = lockSession.getMapper(ExecutionTaskMapper.class);
            assertNotNull(lockedMapper.selectTaskForUpdate(taskId));
            CountDownLatch started = new CountDownLatch(1);
            Future<Integer> heartbeat = executor.submit(() -> {
                started.countDown();
                try (SqlSession session = sqlSessionFactory.openSession(true)) {
                    return session.getMapper(ExecutionTaskMapper.class)
                            .updateTaskLeaseHeartbeat(taskId, "runner-it", "hash-it", 60);
                }
            });
            assertTrue(started.await(2, TimeUnit.SECONDS));
            assertEquals(1, lockedMapper.updateTaskRecoveryRequired(taskId, "recovery won"));
            lockSession.commit();
            assertEquals(Integer.valueOf(0), heartbeat.get(5, TimeUnit.SECONDS));
        }
    }

    private void assertHeartbeatWinsAgainstRecoveryUpdate(Long taskId, ExecutorService executor) throws Exception {
        try (SqlSession lockSession = sqlSessionFactory.openSession(false)) {
            ExecutionTaskMapper lockedMapper = lockSession.getMapper(ExecutionTaskMapper.class);
            assertNotNull(lockedMapper.selectTaskForUpdate(taskId));
            CountDownLatch started = new CountDownLatch(1);
            Future<Integer> recovery = executor.submit(() -> {
                started.countDown();
                try (SqlSession session = sqlSessionFactory.openSession(true)) {
                    return session.getMapper(ExecutionTaskMapper.class)
                            .updateTaskRecoveryRequired(taskId, "recovery must recheck lease");
                }
            });
            assertTrue(started.await(2, TimeUnit.SECONDS));
            assertEquals(1, lockedMapper.updateTaskLeaseHeartbeat(taskId, "runner-it", "hash-it", 60));
            lockSession.commit();
            assertEquals(Integer.valueOf(0), recovery.get(5, TimeUnit.SECONDS));
        }
    }

    private void insertTaskWithId(Long id, String expiryExpression) throws Exception {
        try (SqlSession session = sqlSessionFactory.openSession(true)) {
            insertTask(session, id, expiryExpression);
        }
    }

    private void insertTask(SqlSession session, Long id, String expiryExpression) throws Exception {
        try (Statement statement = session.getConnection().createStatement()) {
            statement.execute("INSERT INTO " + tableName
                    + " (id, task_type, task_status, lease_owner, lease_token_hash, lease_expires_at, heartbeat_at)"
                    + " VALUES (" + id + ", 'EXECUTE_CASE', 'RUNNING', 'runner-it', 'hash-it', "
                    + expiryExpression + ", NOW())");
        }
    }

    private void createIsolatedTable() throws Exception {
        String ddl = "CREATE TABLE " + tableName + " ("
                + "id BIGINT NOT NULL PRIMARY KEY, cycle_id BIGINT NULL, cycle_case_id BIGINT NULL, "
                + "parent_task_id BIGINT NULL, task_type VARCHAR(32) NOT NULL, task_status VARCHAR(32) NOT NULL, "
                + "retry_count INT NOT NULL DEFAULT 0, lease_owner VARCHAR(64) NULL, "
                + "lease_token_hash CHAR(64) NULL, lease_expires_at DATETIME NULL, heartbeat_at DATETIME NULL, "
                + "error_message VARCHAR(1000) NULL) ENGINE=InnoDB";
        String cycleDdl = "CREATE TABLE " + cycleTableName + " ("
                + "id BIGINT NOT NULL PRIMARY KEY, status VARCHAR(24) NOT NULL, "
                + "completed_at DATETIME NULL) ENGINE=InnoDB";
        String cycleCaseDdl = "CREATE TABLE " + cycleCaseTableName + " ("
                + "id BIGINT NOT NULL PRIMARY KEY, cycle_id BIGINT NOT NULL, "
                + "execution_status VARCHAR(24) NOT NULL DEFAULT 'PENDING', "
                + "latest_result VARCHAR(24) NOT NULL DEFAULT 'NOT_RUN', "
                + "KEY idx_cycle_case_status (cycle_id, execution_status)) ENGINE=InnoDB";
        try (Connection connection = DriverManager.getConnection(jdbcUrl, username, password);
             Statement statement = connection.createStatement()) {
            statement.execute(ddl);
            statement.execute(cycleDdl);
            statement.execute(cycleCaseDdl);
        }
    }
    private String loadMapperXml() throws Exception {
        try (InputStream input = getClass().getClassLoader()
                .getResourceAsStream("mapper/execution/ExecutionTaskMapper.xml");
             ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            assertNotNull(input, "ExecutionTaskMapper.xml must be available on the test classpath.");
            byte[] buffer = new byte[4096];
            int count;
            while ((count = input.read(buffer)) != -1) output.write(buffer, 0, count);
            return new String(output.toByteArray(), StandardCharsets.UTF_8);
        }
    }

    private boolean hasText(String value) {
        return value != null && !value.trim().isEmpty();
    }
}
