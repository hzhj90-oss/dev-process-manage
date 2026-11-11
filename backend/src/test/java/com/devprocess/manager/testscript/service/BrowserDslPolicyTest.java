package com.devprocess.manager.testscript.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

class BrowserDslPolicyTest {
    private final ObjectMapper mapper = new ObjectMapper();
    private static final String VALID = "{\"version\":1,\"timeoutMs\":30000,\"steps\":["
            + "{\"action\":\"GOTO\",\"path\":\"/#/test-reports\"},"
            + "{\"action\":\"ASSERT_VISIBLE\",\"selector\":\"h1\"},"
            + "{\"action\":\"ASSERT_TEXT\",\"selector\":\"h1\",\"expected\":\"report\"},"
            + "{\"action\":\"SCREENSHOT\",\"name\":\"report.png\"}]}";

    @Test void allowsReadOnlyBrowserDsl() {
        assertDoesNotThrow(() -> BrowserDslPolicy.validate(VALID, mapper));
    }
    @Test void deniesNavigationOutsideEnvironmentOrigin() {
        for (String path : new String[]{"https://evil.test", "//evil.test", "/../secret", "/%2e%2e/x"}) {
            String invalid = VALID.replace("/#/test-reports", path);
            assertThrows(IllegalArgumentException.class, () -> BrowserDslPolicy.validate(invalid, mapper));
        }
    }
    @Test void blocksCodeInjectionAndUnknownFields() {
        for (String invalid : new String[]{
            VALID.replace("\"action\":\"ASSERT_VISIBLE\"", "\"action\":\"EVAL\""),
            VALID.replace("\"selector\":\"h1\"", "\"selector\":\"h1\",\"evaluate\":\"1+1\""),
            VALID.replace("\"timeoutMs\":30000", "\"timeoutMs\":60001")
        }) assertThrows(IllegalArgumentException.class, () -> BrowserDslPolicy.validate(invalid, mapper));
    }
    @Test void requiresAtLeastOneAssertion() {
        String onlyNavigation = "{\"version\":1,\"steps\":[{\"action\":\"GOTO\",\"path\":\"/\"}]}";
        assertThrows(IllegalArgumentException.class, () -> BrowserDslPolicy.validate(onlyNavigation, mapper));
    }
    @Test void blocksUnsafeScreenshotAndShortcut() {
        assertThrows(IllegalArgumentException.class, () -> BrowserDslPolicy.validate(
                VALID.replace("report.png", "../secret.png"), mapper));
        assertThrows(IllegalArgumentException.class, () -> BrowserDslPolicy.validate(
                VALID.replace("\"action\":\"ASSERT_VISIBLE\",\"selector\":\"h1\"",
                        "\"action\":\"PRESS\",\"selector\":\"h1\",\"key\":\"Control+O\""), mapper));
    }
}

