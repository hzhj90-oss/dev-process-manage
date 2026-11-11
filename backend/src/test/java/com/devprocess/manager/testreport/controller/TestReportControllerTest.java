package com.devprocess.manager.testreport.controller;

import com.devprocess.manager.testreport.service.TestReportService;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import static org.hamcrest.Matchers.containsString;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class TestReportControllerTest {
    @Test
    void reportShouldOpenInlineWithoutCaching() throws Exception {
        TestReportService service = mock(TestReportService.class);
        when(service.generateHtml(eq(9L), anyString())).thenReturn("<html>report</html>");
        MockMvc mvc = MockMvcBuilders.standaloneSetup(new TestReportController(service)).build();

        mvc.perform(get("/api/test-cycles/9/report"))
                .andExpect(status().isOk())
                .andExpect(content().contentTypeCompatibleWith(MediaType.TEXT_HTML))
                .andExpect(header().string(HttpHeaders.CONTENT_DISPOSITION, containsString("inline")))
                .andExpect(header().string(HttpHeaders.CACHE_CONTROL, containsString("no-store")))
                .andExpect(header().string("X-Content-Type-Options", "nosniff"))
                .andExpect(content().string(containsString("report")));

        verify(service).generateHtml(eq(9L), anyString());
    }

    @Test
    void reportShouldDownloadWhenRequested() throws Exception {
        TestReportService service = mock(TestReportService.class);
        when(service.generateHtml(eq(9L), anyString())).thenReturn("<html>report</html>");
        MockMvc mvc = MockMvcBuilders.standaloneSetup(new TestReportController(service)).build();

        mvc.perform(get("/api/test-cycles/9/report").param("download", "true"))
                .andExpect(status().isOk())
                .andExpect(header().string(HttpHeaders.CONTENT_DISPOSITION, containsString("attachment")))
                .andExpect(content().string(containsString("report")));
    }
}
