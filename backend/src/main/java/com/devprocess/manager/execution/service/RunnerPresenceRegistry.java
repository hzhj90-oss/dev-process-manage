package com.devprocess.manager.execution.service;

import java.time.Clock;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Tracks authenticated Runner activity in this JVM; never stores leases or credentials.
 * Observations are ephemeral after application restart, not a durable audit log.
 */
final class RunnerPresenceRegistry {
    private static final long OFFLINE_AFTER_MS = 30_000L;
    private static final long RETAIN_MS = 24L * 60 * 60 * 1000;
    private static final int MAX_INSTANCES = 256;
    private static final List<String> TYPES = Arrays.asList("HTTP", "NODE", "BROWSER");

    private final Clock clock;
    private final ConcurrentHashMap<String, Presence> seen = new ConcurrentHashMap<String, Presence>();

    RunnerPresenceRegistry() { this(Clock.systemUTC()); }
    RunnerPresenceRegistry(Clock clock) { this.clock = clock; }

    void markSeen(String type, String runnerId) {
        if (!TYPES.contains(type) || runnerId == null || !runnerId.matches("[A-Za-z0-9._-]{1,64}")) {
            return;
        }
        String key = type + ":" + runnerId;
        long now = clock.millis();
        if (!seen.containsKey(key) && seen.size() >= MAX_INSTANCES) {
            prune(now);
            if (seen.size() >= MAX_INSTANCES) return;
        }
        seen.compute(key, (ignored, existing) -> {
            if (existing == null) return new Presence(type, runnerId, now);
            existing.lastSeenMillis = Math.max(existing.lastSeenMillis, now);
            return existing;
        });
    }

    Map<String, Object> snapshot() {
        long now = clock.millis();
        prune(now);
        List<Presence> active = new ArrayList<Presence>(seen.values());
        active.sort(Comparator.comparing((Presence p) -> p.type).thenComparing(p -> p.runnerId));
        List<Map<String, Object>> runners = new ArrayList<Map<String, Object>>();
        List<Map<String, Object>> summary = new ArrayList<Map<String, Object>>();
        for (String type : TYPES) {
            int onlineCount = 0, knownCount = 0;
            String latest = null;
            for (Presence presence : active) {
                if (!type.equals(presence.type)) continue;
                long elapsed = Math.max(0L, now - presence.lastSeenMillis);
                boolean online = elapsed <= OFFLINE_AFTER_MS;
                Map<String, Object> item = new LinkedHashMap<String, Object>();
                item.put("runnerType", type);
                item.put("runnerId", presence.runnerId);
                item.put("online", online);
                item.put("lastSeenAt", Instant.ofEpochMilli(presence.lastSeenMillis).toString());
                item.put("secondsSinceLastSeen", elapsed / 1000);
                runners.add(item);
                knownCount++;
                if (online) onlineCount++;
                if (latest == null || latest.compareTo((String) item.get("lastSeenAt")) < 0) {
                    latest = (String) item.get("lastSeenAt");
                }
            }
            Map<String, Object> row = new LinkedHashMap<String, Object>();
            row.put("runnerType", type);
            row.put("onlineCount", onlineCount);
            row.put("knownCount", knownCount);
            row.put("lastSeenAt", latest);
            summary.add(row);
        }
        Map<String, Object> data = new LinkedHashMap<String, Object>();
        data.put("observedAt", Instant.ofEpochMilli(now).toString());
        data.put("offlineAfterSeconds", OFFLINE_AFTER_MS / 1000);
        data.put("summary", summary);
        data.put("runners", runners);
        return data;
    }

    private void prune(long now) {
        seen.entrySet().removeIf(entry -> now - entry.getValue().lastSeenMillis > RETAIN_MS);
    }

    private static final class Presence {
        private final String type;
        private final String runnerId;
        private volatile long lastSeenMillis;
        private Presence(String type, String runnerId, long lastSeenMillis) {
            this.type = type;
            this.runnerId = runnerId;
            this.lastSeenMillis = lastSeenMillis;
        }
    }
}
