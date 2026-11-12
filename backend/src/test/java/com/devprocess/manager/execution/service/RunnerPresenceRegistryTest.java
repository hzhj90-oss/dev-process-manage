package com.devprocess.manager.execution.service;

import org.junit.jupiter.api.Test;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;
import static org.junit.jupiter.api.Assertions.*;

class RunnerPresenceRegistryTest {
    private static final class MutableClock extends Clock {
        long millis = Instant.parse("2026-11-11T00:00:00Z").toEpochMilli();
        @Override public ZoneId getZone() { return ZoneOffset.UTC; }
        @Override public Clock withZone(ZoneId zone) { return this; }
        @Override public Instant instant() { return Instant.ofEpochMilli(millis); }
        @Override public long millis() { return millis; }
    }

    @SuppressWarnings("unchecked")
    private static List<Map<String, Object>> rows(Map<String, Object> value, String key) {
        return (List<Map<String, Object>>) value.get(key);
    }

    @Test void noWorkersAreReportedAsUnseenNotOnline() {
        RunnerPresenceRegistry registry = new RunnerPresenceRegistry(new MutableClock());
        Map<String, Object> snapshot = registry.snapshot();
        assertEquals(0, rows(snapshot, "runners").size());
        assertEquals(3, rows(snapshot, "summary").size());
        for (Map<String, Object> entry : rows(snapshot, "summary")) {
            assertEquals(0, entry.get("knownCount"));
            assertEquals(0, entry.get("onlineCount"));
        }
    }

    @Test void workerBecomesOfflineAndComesBackAfterAuthenticatedPoll() {
        MutableClock clock = new MutableClock();
        RunnerPresenceRegistry registry = new RunnerPresenceRegistry(clock);
        registry.markSeen("HTTP", "runner-01");
        registry.markSeen("HTTP", "runner-01");
        assertEquals(1, rows(registry.snapshot(), "runners").size());
        assertEquals(true, rows(registry.snapshot(), "runners").get(0).get("online"));
        clock.millis += 31_000;
        Map<String, Object> offline = rows(registry.snapshot(), "runners").get(0);
        assertEquals(false, offline.get("online"));
        assertEquals(31L, offline.get("secondsSinceLastSeen"));
        registry.markSeen("HTTP", "runner-01");
        assertEquals(true, rows(registry.snapshot(), "runners").get(0).get("online"));
    }

    @Test void rejectedTypesDoNotCreateEntriesAndOldEntriesExpire() {
        MutableClock clock = new MutableClock();
        RunnerPresenceRegistry registry = new RunnerPresenceRegistry(clock);
        registry.markSeen("PYTHON", "unsupported");
        registry.markSeen("NODE", "bad id!");
        assertTrue(rows(registry.snapshot(), "runners").isEmpty());
        registry.markSeen("BROWSER", "browser-01");
        registry.markSeen("NODE", "node-01");
        assertEquals(2, rows(registry.snapshot(), "runners").size());
        clock.millis += 24L * 60L * 60L * 1000L + 1L;
        assertTrue(rows(registry.snapshot(), "runners").isEmpty());
    }
}
