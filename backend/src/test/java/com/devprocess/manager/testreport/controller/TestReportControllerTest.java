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
    void reviewShouldReturnReadOnlyMetadata() throws Exception {
        TestReportService service = mock(TestReportService.class);
        java.util.Map<String, Object> summary = new java.util.LinkedHashMap<String, Object>();
        summary.put("cycleId", 45L);
        summary.put("total", 1);
        summary.put("rows", java.util.Collections.singletonList(
                java.util.Collections.singletonMap("taskId", 112L)));
        when(service.review(45L)).thenReturn(summary);
        MockMvc mvc = MockMvcBuilders.standaloneSetup(new TestReportController(service)).build();

        mvc.perform(get("/api/test-cycles/45/report/review"))
                .andExpect(status().isOk())
                .andExpect(header().string(HttpHeaders.CACHE_CONTROL, containsString("no-store")))
                .andExpect(header().string("X-Content-Type-Options", "nosniff"))
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_JSON))
                .andExpect(content().string(containsString("\"taskId\":112")))
                .andExpect(content().string(containsString("\"cycleId\":45")));

        verify(service).review(45L);
    }

    @Test
    void roundCompareMustBeReadOnlyAndUncached() throws Exception {
        TestReportService service = mock(TestReportService.class);
        java.util.Map<String, Object> sample = new java.util.LinkedHashMap<String, Object>();
        sample.put("cycleId", 91L);
        sample.put("previousCycleId", 90L);
        sample.put("total", 1);
        when(service.compare(91L)).thenReturn(sample);
        MockMvc mvc = MockMvcBuilders.standaloneSetup(new TestReportController(service)).build();
        mvc.perform(get("/api/test-cycles/91/report/compare"))
                .andExpect(status().isOk())
                .andExpect(header().string(HttpHeaders.CACHE_CONTROL, containsString("no-store")))
                .andExpect(header().string("X-Content-Type-Options", "nosniff"))
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_JSON))
                .andExpect(content().string(containsString("\"previousCycleId\":90")));
        verify(service).compare(91L);
    }

    @Test
    void csvShouldDownloadWithNoStoreAndNoSniff() throws Exception {
        TestReportService service = mock(TestReportService.class);
        when(service.generateCsv(9L)).thenReturn("\uFEFF\"用例编号\"\r\n\"TC-1\"\r\n");
        MockMvc mvc = MockMvcBuilders.standaloneSetup(new TestReportController(service)).build();

        mvc.perform(get("/api/test-cycles/9/report.csv"))
                .andExpect(status().isOk())
                .andExpect(content().contentTypeCompatibleWith(new MediaType("text", "csv")))
                .andExpect(header().string(HttpHeaders.CONTENT_DISPOSITION, containsString("attachment")))
                .andExpect(header().string(HttpHeaders.CONTENT_DISPOSITION, containsString("test-cycle-9-report.csv")))
                .andExpect(header().string(HttpHeaders.CACHE_CONTROL, containsString("no-store")))
                .andExpect(header().string("X-Content-Type-Options", "nosniff"))
                .andExpect(content().string(containsString("TC-1")));

        verify(service).generateCsv(9L);
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
