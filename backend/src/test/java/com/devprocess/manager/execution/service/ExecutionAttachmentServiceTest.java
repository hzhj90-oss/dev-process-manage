package com.devprocess.manager.execution.service;

import com.devprocess.manager.common.exception.BusinessException;
import com.devprocess.manager.execution.dto.ExecutionAttachmentFile;
import com.devprocess.manager.execution.dto.ExecutionAttachmentInsertDTO;
import com.devprocess.manager.execution.mapper.ExecutionTaskMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.util.ReflectionTestUtils;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.HashMap;
import java.util.Map;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class ExecutionAttachmentServiceTest {
    @TempDir
    Path tempDir;
    private ExecutionTaskMapper mapper;
    private ExecutionAttachmentService service;

    @BeforeEach
    void setUp() {
        mapper = mock(ExecutionTaskMapper.class);
        service = new ExecutionAttachmentService(mapper);
        ReflectionTestUtils.setField(service, "storageDirectory", tempDir.toString());
        ReflectionTestUtils.setField(service, "maxFileSizeBytes", 20L * 1024L * 1024L);
    }

    @Test
    void uploadMustStoreRandomFileAndPersistOnlyRelativePath() throws Exception {
        when(mapper.selectExecutionForUpdate(7L, 11L)).thenReturn(row("id", 11L));
        doAnswer(invocation -> {
            ExecutionAttachmentInsertDTO dto = invocation.getArgument(0);
            dto.setId(51L);
            return 1;
        }).when(mapper).insertAttachment(any(ExecutionAttachmentInsertDTO.class));
        byte[] png = new byte[] {(byte) 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a};
        MockMultipartFile file = new MockMultipartFile("file", "..\\..\\截图.png",
                "application/octet-stream", png);
        Map<String, Object> result = service.upload(7L, 11L, file, "SCREENSHOT", "tester");
        assertEquals(51L, result.get("id"));
        assertEquals("截图.png", result.get("fileName"));
        assertEquals("image/png", result.get("mimeType"));
        assertEquals(64, String.valueOf(result.get("sha256")).length());
        try (java.util.stream.Stream<Path> paths = Files.walk(tempDir)) {
            Path stored = paths.filter(Files::isRegularFile).findFirst().orElseThrow(AssertionError::new);
            assertTrue(stored.startsWith(tempDir));
            assertNotEquals("截图.png", stored.getFileName().toString());
        }
        verify(mapper).insertAttachment(argThat(dto -> dto.getRelativePath().startsWith("execution/7/")
                && !dto.getRelativePath().contains("..")));
    }

    @Test
    void uploadMustRejectUnsupportedExtensionAndForgedImageContent() {
        when(mapper.selectExecutionForUpdate(7L, 11L)).thenReturn(row("id", 11L));
        MockMultipartFile unsupported = new MockMultipartFile("file", "payload.exe",
                "application/octet-stream", new byte[] {1, 2, 3});
        assertThrows(BusinessException.class,
                () -> service.upload(7L, 11L, unsupported, "OTHER", "tester"));
        MockMultipartFile forged = new MockMultipartFile("file", "payload.png",
                "image/png", "not an image".getBytes(java.nio.charset.StandardCharsets.UTF_8));
        assertThrows(BusinessException.class,
                () -> service.upload(7L, 11L, forged, "SCREENSHOT", "tester"));
        verify(mapper, never()).insertAttachment(any(ExecutionAttachmentInsertDTO.class));
    }

    @Test
    void uploadMustRejectFilesOverConfiguredLimitBeforeWriting() {
        when(mapper.selectExecutionForUpdate(7L, 11L)).thenReturn(row("id", 11L));
        ReflectionTestUtils.setField(service, "maxFileSizeBytes", 4L);
        MockMultipartFile oversized = new MockMultipartFile("file", "large.txt", "text/plain",
                "12345".getBytes(java.nio.charset.StandardCharsets.UTF_8));
        assertThrows(BusinessException.class,
                () -> service.upload(7L, 11L, oversized, "LOG", "tester"));
        verify(mapper, never()).insertAttachment(any(ExecutionAttachmentInsertDTO.class));
        try (java.util.stream.Stream<Path> paths = Files.walk(tempDir)) {
            assertEquals(0, paths.filter(Files::isRegularFile).count());
        } catch (java.io.IOException exception) {
            throw new AssertionError(exception);
        }
    }

    @Test
    void uploadMustDeleteStoredFileWhenMetadataInsertFails() throws Exception {
        when(mapper.selectExecutionForUpdate(7L, 11L)).thenReturn(row("id", 11L));
        doThrow(new RuntimeException("database unavailable"))
                .when(mapper).insertAttachment(any(ExecutionAttachmentInsertDTO.class));
        MockMultipartFile file = new MockMultipartFile("file", "trace.log", "text/plain",
                "runner started".getBytes(java.nio.charset.StandardCharsets.UTF_8));
        assertThrows(RuntimeException.class,
                () -> service.upload(7L, 11L, file, "LOG", "tester"));
        try (java.util.stream.Stream<Path> paths = Files.walk(tempDir)) {
            assertEquals(0, paths.filter(Files::isRegularFile).count());
        }
    }

    @Test
    void uploadMustRejectUnknownExecution() {
        when(mapper.selectExecutionForUpdate(7L, 11L)).thenReturn(null);
        MockMultipartFile file = new MockMultipartFile("file", "trace.log", "text/plain",
                "runner started".getBytes(java.nio.charset.StandardCharsets.UTF_8));
        assertThrows(BusinessException.class,
                () -> service.upload(7L, 11L, file, "LOG", "tester"));
        verify(mapper, never()).insertAttachment(any(ExecutionAttachmentInsertDTO.class));
    }

    @Test
    void downloadMustVerifyTaskExecutionOwnershipAndRejectTraversal() throws Exception {
        when(mapper.selectExecutionForUpdate(7L, 11L)).thenReturn(row("id", 11L));
        Path stored = tempDir.resolve("execution/7/random.png");
        Files.createDirectories(stored.getParent());
        Files.write(stored, new byte[] {(byte) 0x89, 0x50, 0x4e, 0x47});
        when(mapper.selectAttachmentById(51L)).thenReturn(row(
                "id", 51L, "executionId", 11L, "relativePath", "execution/7/random.png",
                "fileName", "proof.png", "mimeType", "image/png", "fileSize", 4L));
        ExecutionAttachmentFile downloaded = service.download(7L, 11L, 51L);
        assertEquals(stored.toRealPath(), downloaded.getPath().toRealPath());
        assertEquals("proof.png", downloaded.getFileName());
        when(mapper.selectAttachmentById(52L)).thenReturn(row(
                "id", 52L, "executionId", 11L, "relativePath", "../../outside.txt",
                "fileName", "outside.txt", "mimeType", "text/plain", "fileSize", 1L));
        assertThrows(BusinessException.class, () -> service.download(7L, 11L, 52L));
    }

    @Test
    void downloadMustNotExposeAttachmentFromAnotherExecution() {
        when(mapper.selectExecutionForUpdate(7L, 11L)).thenReturn(row("id", 11L));
        when(mapper.selectAttachmentById(99L)).thenReturn(row("id", 99L, "executionId", 12L));
        assertThrows(BusinessException.class, () -> service.download(7L, 11L, 99L));
    }

    private Map<String, Object> row(Object... values) {
        Map<String, Object> result = new HashMap<String, Object>();
        for (int i = 0; i < values.length; i += 2) result.put(String.valueOf(values[i]), values[i + 1]);
        return result;
    }
}
