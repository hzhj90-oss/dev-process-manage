package com.devprocess.manager.testscript.service;

import org.junit.jupiter.api.Assumptions;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;

import static org.junit.jupiter.api.Assertions.*;

class ScriptPathPolicyTest {
    @TempDir
    Path tempDir;

    @Test
    void acceptsPortableRelativePathsAndNormalizesWindowsSeparators() {
        assertEquals("python/scripts/health.py",
                ScriptPathPolicy.normalizeRelativePath("python\\scripts\\health.py"));
        assertEquals("java/Main.java",
                ScriptPathPolicy.normalizeRelativePath("java/Main.java"));
        assertEquals(".hidden/config.json",
                ScriptPathPolicy.normalizeRelativePath(".hidden/config.json"));
    }

    @Test
    void rejectsAbsoluteTraversalAndEncodedPaths() {
        String[] invalid = {null, "", "  ", "/etc/passwd", "//server/share",
                "\\\\server\\share", "C:\\Windows\\win.ini", "C:relative",
                "scripts/../secret.py", "scripts/./health.py", "../secret.py",
                "scripts//health.py", "scripts/", "./health.py", "script/%2e%2e/x",
                "script/%2Fhidden", "script/a:b", "script/a?b", "script/a#b",
                "script/CON", "script/NUL.txt", "script/com1.js", "script/LPT9",
                "script/a.", "script/a ", " script/a", "script/a|b",
                "script/a*source", "script/a\u0000b", "script/a\nb"
        };
        for (String value : invalid) {
            assertThrows(IllegalArgumentException.class,
                    () -> ScriptPathPolicy.normalizeRelativePath(value),
                    "Expected path rejection: " + value);
        }
        assertThrows(IllegalArgumentException.class,
                () -> ScriptPathPolicy.normalizeRelativePath(
                        String.join("", java.util.Collections.nCopies(513, "a"))));
    }

    @Test
    void resolvesExistingFileOnlyWithinItsConfiguredRoot() throws Exception {
        Path root = Files.createDirectory(tempDir.resolve("scripts"));
        Path subdir = Files.createDirectory(root.resolve("python"));
        Path expected = subdir.resolve("health.py");
        Files.write(expected, "print('ok')".getBytes(StandardCharsets.UTF_8));
        assertEquals(expected.toRealPath(),
                ScriptPathPolicy.resolveExistingReadOnlyFile(root, "python/health.py"));
        assertThrows(IOException.class,
                () -> ScriptPathPolicy.resolveExistingReadOnlyFile(root, "python/missing.py"));
        assertThrows(IOException.class,
                () -> ScriptPathPolicy.resolveExistingReadOnlyFile(root, "python"));
        assertThrows(IllegalArgumentException.class,
                () -> ScriptPathPolicy.resolveExistingReadOnlyFile(root, "../outside.txt"));
        assertThrows(IOException.class,
                () -> ScriptPathPolicy.resolveExistingReadOnlyFile(
                        tempDir.resolve("missing-root"), "python/health.py"));
    }

    @Test
    void rejectsSymlinkedPathComponentsWhenSupported() throws Exception {
        Path root = Files.createDirectory(tempDir.resolve("scripts"));
        Path outside = Files.write(tempDir.resolve("outside.txt"),
                "private".getBytes(StandardCharsets.UTF_8));
        try {
            Files.createSymbolicLink(root.resolve("alias.txt"), outside);
        } catch (UnsupportedOperationException | IOException | SecurityException exception) {
            Assumptions.assumeTrue(false,
                    "The platform does not permit test-created symbolic links: " + exception);
        }
        assertThrows(IOException.class,
                () -> ScriptPathPolicy.resolveExistingReadOnlyFile(root, "alias.txt"));

        Path linkRoot = root.resolve("root-link");
        Files.createSymbolicLink(linkRoot, tempDir);
        assertThrows(IOException.class,
                () -> ScriptPathPolicy.resolveExistingReadOnlyFile(linkRoot, "outside.txt"));
    }
}
