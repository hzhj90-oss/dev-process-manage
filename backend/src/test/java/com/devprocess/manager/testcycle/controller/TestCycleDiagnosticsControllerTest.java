package com.devprocess.manager.testcycle.controller;

import com.devprocess.manager.testcycle.service.TestCycleService;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.Map;
import static org.hamcrest.Matchers.containsString;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class TestCycleDiagnosticsControllerTest {
    @Test
    void diagnosisResponseIsNoStoreAndMetadataOnly() throws Exception {
        TestCycleService service = mock(TestCycleService.class);
        Map<String, Object> result = new LinkedHashMap<String, Object>();
        result.put("readOnly", true);
        result.put("count", 1);
        result.put("items", Collections.singletonList(
                Collections.singletonMap("cycleId", 30L)));
        when(service.statusDiagnostics(100)).thenReturn(result);
        MockMvc mvc = MockMvcBuilders.standaloneSetup(new TestCycleController(service)).build();

        mvc.perform(get("/api/test-cycles/diagnostics"))
                .andExpect(status().isOk())
                .andExpect(header().string(HttpHeaders.CACHE_CONTROL, containsString("no-store")))
                .andExpect(header().string("X-Content-Type-Options", "nosniff"))
                .andExpect(content().string(containsString("\"cycleId\":30")))
                .andExpect(content().string(containsString("\"readOnly\":true")));
        verify(service).statusDiagnostics(100);
        verifyNoMoreInteractions(service);
    }
}
