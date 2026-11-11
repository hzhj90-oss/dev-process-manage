package com.devprocess.manager.testscript.service;

import com.devprocess.manager.common.exception.BusinessException;
import com.devprocess.manager.testscript.dto.ScriptSaveRequest;
import com.devprocess.manager.testscript.mapper.TestScriptMapper;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.mock;

class TestScriptServiceTest {
    private TestScriptService service;

    @BeforeEach
    void setUp() {
        service = new TestScriptService(mock(TestScriptMapper.class), new ObjectMapper());
    }

    @Test
    void validReadOnlyHttpDslMustBeAccepted() {
        ScriptSaveRequest request = request(validDsl());
        assertDoesNotThrow(() -> normalize(request));
    }

    @Test
    void httpDslMustRejectWriteMethods() {
        String dsl = validDsl().replace("\"GET\"", "\"POST\"");
        BusinessException exception = assertThrows(BusinessException.class,
                () -> normalize(request(dsl)));
        assertEquals(400, exception.getStatus());
    }

    @Test
    void httpDslMustRejectAbsoluteUrlsAndTraversal() {
        String absolute = validDsl().replace("\"/api/health\"", "\"https://example.com/api/health\"");
        assertThrows(BusinessException.class, () -> normalize(request(absolute)));

        String traversal = validDsl().replace("\"/api/health\"", "\"/api/../admin\"");
        assertThrows(BusinessException.class, () -> normalize(request(traversal)));
    }

    @Test
    void httpDslMustRejectCredentialsAndRequestBodies() {
        String authHeader = validDsl().replace("\"headers\":{}",
                "\"headers\":{\"Authorization\":\"Bearer abc\"}");
        assertThrows(BusinessException.class, () -> normalize(request(authHeader)));

        String body = validDsl().replace("\"method\":\"GET\"", "\"method\":\"GET\",\"body\":{\"enabled\":true}");
        assertThrows(BusinessException.class, () -> normalize(request(body)));
    }

    @Test
    void httpDslMustRejectSensitiveCustomHeadersAndQueryParameters() {
        String apiKeyHeader = validDsl().replace("\"headers\":{}",
                "\"headers\":{\"X-Api-Key\":\"secret\"}");
        assertThrows(BusinessException.class, () -> normalize(request(apiKeyHeader)));

        String tokenQuery = validDsl().replace("\"query\":{}",
                "\"query\":{\"access_token\":\"secret\"}");
        assertThrows(BusinessException.class, () -> normalize(request(tokenQuery)));
    }

    @Test
    void httpDslMustRejectFileSourceUntilControlledFileRunnerExists() {
        ScriptSaveRequest request = request(validDsl());
        request.setSourceType("FILE");
        request.setSourcePath("http/health.json");
        request.setSourceContent(null);
        BusinessException exception = assertThrows(BusinessException.class, () -> normalize(request));
        assertEquals(400, exception.getStatus());
    }

    @Test
    void nodeRunnerV1MustAcceptInlineScriptAndRejectFileOrInvalidEntryPoint() {
        ScriptSaveRequest valid = request("function main(ctx) { assert.ok(ctx); }");
        valid.setScriptLanguage("NODE");
        valid.setEntryPoint("main");
        assertDoesNotThrow(() -> normalize(valid));

        ScriptSaveRequest file = request("function main(ctx) { assert.ok(ctx); }");
        file.setScriptLanguage("NODE");
        file.setSourceType("FILE");
        file.setSourcePath("node/health.js");
        file.setSourceContent(null);
        assertThrows(BusinessException.class, () -> normalize(file));

        ScriptSaveRequest invalidEntry = request("function main(ctx) { assert.ok(ctx); }");
        invalidEntry.setScriptLanguage("NODE");
        invalidEntry.setEntryPoint("main()");
        assertThrows(BusinessException.class, () -> normalize(invalidEntry));
    }

    @Test
    void inlineSourceLimitMustUseUtf8ByteLength() {
        StringBuilder content = new StringBuilder(40000);
        for (int i = 0; i < 40000; i++) content.append('中');
        ScriptSaveRequest request = request(content.toString());
        request.setScriptLanguage("NODE");
        request.setEntryPoint("main");

        BusinessException exception = assertThrows(BusinessException.class,
                () -> normalize(request));

        assertEquals(400, exception.getStatus());
    }

    @Test
    void fileScriptsAreRegisteredWithStrictPortablePathsButNotExecuted() {
        ScriptSaveRequest safe = request(validDsl());
        safe.setScriptLanguage("PYTHON");
        safe.setSourceType("FILE");
        safe.setSourcePath("scripts\\health.py");
        safe.setSourceContent(null);
        assertDoesNotThrow(() -> normalize(safe));
        assertEquals("scripts/health.py", safe.getSourcePath());

        for (String path : new String[] {"scripts/../secret.py", "scripts//health.py",
                "scripts/%2e%2e/secret.py", "C:\\Windows\\system.ini",
                "scripts/NUL.txt", "scripts/health.py/"}) {
            ScriptSaveRequest unsafe = request(validDsl());
            unsafe.setScriptLanguage("JAVA");
            unsafe.setSourceType("FILE");
            unsafe.setSourcePath(path);
            unsafe.setSourceContent(null);
            assertEquals(400, assertThrows(BusinessException.class,
                    () -> normalize(unsafe), "Path should be rejected: " + path).getStatus());
        }
    }

    private void normalize(ScriptSaveRequest request) {
        ReflectionTestUtils.invokeMethod(service, "normalize", request);
    }

    private ScriptSaveRequest request(String dsl) {
        ScriptSaveRequest request = new ScriptSaveRequest();
        request.setScriptCode("HTTP-HEALTH");
        request.setScriptName("HTTP health check");
        request.setScriptLanguage("HTTP");
        request.setScriptVersion("1.0.0");
        request.setSourceType("INLINE");
        request.setSourceContent(dsl);
        request.setEntryPoint("request");
        request.setEnabled(Boolean.TRUE);
        return request;
    }

    private String validDsl() {
        return "{\"version\":1,"
                + "\"request\":{\"base\":\"API\",\"method\":\"GET\","
                + "\"path\":\"/api/health\",\"headers\":{},\"query\":{},\"timeoutMs\":10000},"
                + "\"assertions\":[{\"type\":\"STATUS_EQUALS\",\"expected\":200},"
                + "{\"type\":\"JSON_PATH_EQUALS\",\"path\":\"$.status\",\"expected\":\"UP\"}]}";
    }
}
