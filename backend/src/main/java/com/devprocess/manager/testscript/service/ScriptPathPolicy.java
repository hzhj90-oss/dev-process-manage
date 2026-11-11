package com.devprocess.manager.testscript.service;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.LinkOption;
import java.nio.file.Path;
import java.util.regex.Pattern;

/**
 * FILE scripts must be inside a dedicated script root. This is a path validation
 * prerequisite, not an OS sandbox or permission to execute script content.
 */
public final class ScriptPathPolicy {
    private static final Pattern WINDOWS_DEVICE = Pattern.compile(
            "(?i)^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(\\..*)?$");
    private static final LinkOption NO_FOLLOW = LinkOption.NOFOLLOW_LINKS;

    private ScriptPathPolicy() { }

    public static String normalizeRelativePath(String raw) {
        if (raw == null) throw invalid();
        String value = raw.replace('\\', '/');
        if (value.isEmpty() || value.length() > 512 || value.startsWith("/")
                || !value.equals(value.trim())) {
            throw invalid();
        }
        // Treat both Windows and POSIX paths as untrusted on every platform.
        if (value.indexOf(':') >= 0 || value.indexOf('%') >= 0
                || value.indexOf('?') >= 0 || value.indexOf('#') >= 0) throw invalid();
        for (String segment : value.split("/", -1)) {
            if (segment.isEmpty() || ".".equals(segment) || "..".equals(segment)
                    || segment.length() > 255 || segment.endsWith(" ")
                    || segment.endsWith(".") || WINDOWS_DEVICE.matcher(segment).matches()) {
                throw invalid();
            }
            for (int i = 0; i < segment.length(); i++) {
                char c = segment.charAt(i);
                if (c <= 31 || c == 127 || c == '<' || c == '>'
                        || c == '"' || c == '|' || c == '*') throw invalid();
            }
        }
        return value;
    }

    /**
     * Resolve an existing regular file, rejecting symlinked components.
     * Call again immediately before access; the operating system must still
     * isolate actual execution from filesystem mutation and TOCTOU races.
     */
    public static Path resolveExistingReadOnlyFile(Path scriptRoot, String raw) throws IOException {
        String relative = normalizeRelativePath(raw);
        if (scriptRoot == null) throw new IOException("Script root is not configured");
        Path root = scriptRoot.toAbsolutePath().normalize();
        if (Files.isSymbolicLink(root) || !Files.isDirectory(root, NO_FOLLOW)) {
            throw new IOException("Script root must be an existing real directory");
        }
        Path realRoot = root.toRealPath();
        Path current = realRoot;
        String[] parts = relative.split("/");
        for (int i = 0; i < parts.length; i++) {
            current = current.resolve(parts[i]).normalize();
            if (!current.startsWith(realRoot) || Files.isSymbolicLink(current)
                    || !Files.exists(current, NO_FOLLOW)) {
                throw new IOException("Script path is missing, linked, or outside script root");
            }
            Path realCurrent = current.toRealPath();
            if (!realCurrent.startsWith(realRoot)) {
                throw new IOException("Script path escapes script root");
            }
            if (i + 1 < parts.length && !Files.isDirectory(current, NO_FOLLOW)) {
                throw new IOException("Script path has a non-directory parent");
            }
        }
        if (!Files.isRegularFile(current, NO_FOLLOW)) {
            throw new IOException("Script path is not a regular file");
        }
        return current.toRealPath();
    }

    private static IllegalArgumentException invalid() {
        return new IllegalArgumentException("Script path must be a safe relative path");
    }
}
