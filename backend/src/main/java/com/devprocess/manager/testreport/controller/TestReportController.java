package com.devprocess.manager.testreport.controller;

import com.devprocess.manager.testreport.service.TestReportService;
import org.springframework.http.CacheControl;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.support.ServletUriComponentsBuilder;

import java.nio.charset.StandardCharsets;

@RestController
@RequestMapping("/api/test-cycles")
public class TestReportController {
    private final TestReportService service;

    public TestReportController(TestReportService service) {
        this.service = service;
    }

    /** Read-only CSV summary, one row per case. Never returns raw execution bodies. */
    /** Read-only, metadata-only case triage for the selected cycle. */
    @GetMapping("/{id}/report/review")
    public ResponseEntity<java.util.Map<String, Object>> review(@PathVariable Long id) {
        return ResponseEntity.ok()
                .cacheControl(CacheControl.noStore())
                .header("X-Content-Type-Options", "nosniff")
                .body(service.review(id));
    }

    /** Read-only comparison to the nearest earlier COMPLETED round in this version. */
    @GetMapping("/{id}/report/compare")
    public ResponseEntity<java.util.Map<String, Object>> compare(@PathVariable Long id) {
        return ResponseEntity.ok()
                .cacheControl(CacheControl.noStore())
                .header("X-Content-Type-Options", "nosniff")
                .body(service.compare(id));
    }

    @GetMapping("/{id}/report.csv")
    public ResponseEntity<String> csv(@PathVariable Long id) {
        String csv = service.generateCsv(id);
        ContentDisposition disposition = ContentDisposition.attachment()
                .filename("test-cycle-" + id + "-report.csv", StandardCharsets.UTF_8).build();
        return ResponseEntity.ok()
                .contentType(new MediaType("text", "csv", StandardCharsets.UTF_8))
                .cacheControl(CacheControl.noStore())
                .header(HttpHeaders.CONTENT_DISPOSITION, disposition.toString())
                .header("X-Content-Type-Options", "nosniff")
                .body(csv);
    }

    @GetMapping("/{id}/report")
    public ResponseEntity<String> report(@PathVariable Long id,
            @RequestParam(defaultValue = "false") boolean download) {
        String baseUrl = ServletUriComponentsBuilder.fromCurrentContextPath().build().toUriString();
        String html = service.generateHtml(id, baseUrl);
        ContentDisposition disposition = (download ? ContentDisposition.attachment() : ContentDisposition.inline())
                .filename("test-cycle-" + id + "-report.html", StandardCharsets.UTF_8).build();
        return ResponseEntity.ok()
                .contentType(new MediaType("text", "html", StandardCharsets.UTF_8))
                .cacheControl(CacheControl.noStore())
                .header(HttpHeaders.CONTENT_DISPOSITION, disposition.toString())
                .header("X-Content-Type-Options", "nosniff")
                .body(html);
    }
}
