package com.devprocess.manager.testscript.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.HashSet;
import java.util.Iterator;
import java.util.Set;

public final class BrowserDslPolicy {
    private static final Set<String> ACTIONS = new HashSet<String>(Arrays.asList(
            "GOTO", "CLICK", "FILL", "PRESS", "ASSERT_VISIBLE",
            "ASSERT_TEXT", "ASSERT_TITLE", "WAIT_VISIBLE", "SCREENSHOT"));
    private static final Set<String> KEYS = new HashSet<String>(Arrays.asList(
            "Enter", "Tab", "Escape", "Backspace", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"));
    private BrowserDslPolicy() { }

    public static void validate(String source, ObjectMapper mapper) {
        if (source == null || source.getBytes(StandardCharsets.UTF_8).length > 32 * 1024)
            throw new IllegalArgumentException("Browser DSL exceeds 32 KB");
        JsonNode root;
        try { root = mapper.readTree(source); }
        catch (Exception e) { throw new IllegalArgumentException("Browser DSL must be valid JSON"); }
        if (root == null || !root.isObject() || !allowed(root, "version", "timeoutMs", "steps")
                || root.path("version").asInt(-1) != 1 || !root.path("version").isIntegralNumber())
            throw new IllegalArgumentException("Browser DSL requires version 1");
        JsonNode timeout = root.path("timeoutMs");
        if (!timeout.isMissingNode() && (!timeout.isIntegralNumber()
                || timeout.asInt() < 1000 || timeout.asInt() > 60000))
            throw new IllegalArgumentException("Invalid browser deadline");
        JsonNode steps = root.path("steps");
        if (!steps.isArray() || steps.size() < 1 || steps.size() > 30
                || !"GOTO".equals(steps.get(0).path("action").asText()))
            throw new IllegalArgumentException("Browser DSL requires 1-30 steps starting with GOTO");
        int shots = 0;
        int assertions = 0;
        for (JsonNode step : steps) {
            if (!step.isObject() || !step.path("action").isTextual()) throw invalid();
            String action = step.path("action").asText();
            if (!ACTIONS.contains(action)) throw invalid();
            if (action.startsWith("ASSERT_")) assertions++;
            switch (action) {
                case "GOTO":
                    if (!allowed(step, "action", "path") || !safePath(step.path("path"))) throw invalid();
                    break;
                case "FILL":
                    if (!allowed(step, "action", "selector", "value") || !selector(step.path("selector"))
                            || !step.path("value").isTextual() || step.path("value").asText().length() > 500)
                        throw invalid();
                    break;
                case "PRESS":
                    if (!allowed(step, "action", "selector", "key") || !selector(step.path("selector"))
                            || !KEYS.contains(step.path("key").asText())) throw invalid();
                    break;
                case "ASSERT_TEXT":
                    if (!allowed(step, "action", "selector", "expected") || !selector(step.path("selector"))
                            || !shortText(step.path("expected"), 250)) throw invalid();
                    break;
                case "ASSERT_TITLE":
                    if (!allowed(step, "action", "expected") || !shortText(step.path("expected"), 250))
                        throw invalid();
                    break;
                case "SCREENSHOT":
                    String name = step.path("name").asText("");
                    if (!allowed(step, "action", "name") || name.length() > 64
                            || !name.matches("[A-Za-z0-9][A-Za-z0-9._-]*\\.png") || ++shots > 3)
                        throw invalid();
                    break;
                default:
                    if (!allowed(step, "action", "selector") || !selector(step.path("selector")))
                        throw invalid();
            }
        }
        if (assertions == 0) throw new IllegalArgumentException("Browser DSL requires an assertion");
    }
    private static boolean allowed(JsonNode node, String... keys) {
        Set<String> permitted = new HashSet<String>(Arrays.asList(keys));
        Iterator<String> iterator = node.fieldNames();
        while (iterator.hasNext()) if (!permitted.contains(iterator.next())) return false;
        return true;
    }
    private static boolean shortText(JsonNode node, int limit) {
        return node.isTextual() && node.asText().length() > 0
                && node.asText().length() <= limit && !node.asText().matches("(?s).*\\p{Cntrl}.*");
    }
    private static boolean selector(JsonNode node) { return shortText(node, 250); }
    private static boolean safePath(JsonNode node) {
        if (!shortText(node, 512)) return false;
        String value = node.asText();
        if (!value.startsWith("/") || value.startsWith("//") || value.contains("\\")
                || value.contains("%")) return false;
        String pathname = value.split("[?#]", 2)[0];
        for (String part : pathname.split("/", -1)) if (".".equals(part) || "..".equals(part)) return false;
        return true;
    }
    private static IllegalArgumentException invalid() {
        return new IllegalArgumentException("Invalid or unsupported Browser DSL operation");
    }
}
