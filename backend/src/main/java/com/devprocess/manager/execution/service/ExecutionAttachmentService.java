package com.devprocess.manager.execution.service;

import com.devprocess.manager.common.exception.BusinessException;
import com.devprocess.manager.execution.dto.ExecutionAttachmentFile;
import com.devprocess.manager.execution.dto.ExecutionAttachmentInsertDTO;
import com.devprocess.manager.execution.mapper.ExecutionTaskMapper;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.web.multipart.MultipartFile;
import java.io.IOException;
import java.nio.ByteBuffer;
import java.nio.charset.CodingErrorAction;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.LinkOption;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardOpenOption;
import java.security.MessageDigest;
import java.util.Arrays;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;

@Service
public class ExecutionAttachmentService {
    private static final long DEFAULT_MAX_FILE_SIZE = 20L * 1024L * 1024L;
    private static final Map<String, String> MIME_TYPES = new HashMap<String, String>();
    private final ExecutionTaskMapper mapper;
    @Value("${execution.attachments.storage-dir:./data/uploads/executions}")
    private String storageDirectory;
    @Value("${execution.attachments.max-file-size-bytes:20971520}")
    private long maxFileSizeBytes;
    static {
        MIME_TYPES.put("png", "image/png");
        MIME_TYPES.put("jpg", "image/jpeg");
        MIME_TYPES.put("jpeg", "image/jpeg");
        MIME_TYPES.put("gif", "image/gif");
        MIME_TYPES.put("webp", "image/webp");
        MIME_TYPES.put("pdf", "application/pdf");
        MIME_TYPES.put("txt", "text/plain");
        MIME_TYPES.put("log", "text/plain");
        MIME_TYPES.put("json", "application/json");
        MIME_TYPES.put("csv", "text/csv");
    }

    public ExecutionAttachmentService(ExecutionTaskMapper mapper) {
        this.mapper = mapper;
    }

    @Transactional
    public Map<String, Object> upload(Long taskId, Long executionId, MultipartFile file,
            String attachmentType, String createdBy) {
        if (file == null || file.isEmpty()) throw badRequest("请选择要上传的证据文件");
        if (file.getSize() > maxFileSizeBytes || file.getSize() > DEFAULT_MAX_FILE_SIZE) {
            throw new BusinessException(HttpStatus.PAYLOAD_TOO_LARGE.value(), "单个证据文件不能超过 20 MB");
        }
        Map<String, Object> execution = mapper.selectExecutionForUpdate(taskId, executionId);
        if (execution == null) throw notFound("执行任务或执行记录不存在");
        String type = normalizeType(attachmentType);
        String originalName = safeFileName(file.getOriginalFilename());
        String extension = extensionOf(originalName);
        String mimeType = MIME_TYPES.get(extension);
        if (mimeType == null) throw badRequest("不支持该文件类型，仅允许 PNG/JPG/GIF/WEBP/PDF/TXT/LOG/JSON/CSV");
        byte[] content;
        try {
            content = file.getBytes();
        } catch (IOException exception) {
            throw new BusinessException(500, "读取上传文件失败");
        }
        if (content.length > maxFileSizeBytes || content.length > DEFAULT_MAX_FILE_SIZE) {
            throw new BusinessException(HttpStatus.PAYLOAD_TOO_LARGE.value(), "单个证据文件不能超过 20 MB");
        }
        validateContent(extension, content);
        Path root = storageRoot();
        String relativeName = "execution/" + taskId + "/" + UUID.randomUUID().toString().replace("-", "")
                + "." + extension;
        Path target = root.resolve(relativeName).normalize();
        if (!target.startsWith(root)) throw badRequest("证据文件路径不合法");
        try {
            Files.createDirectories(target.getParent());
            Path realRoot = root.toRealPath();
            if (!target.getParent().toRealPath().startsWith(realRoot)) {
                throw badRequest("证据文件存储目录不合法");
            }
            Files.write(target, content, StandardOpenOption.CREATE_NEW, StandardOpenOption.WRITE);
        } catch (IOException exception) {
            throw new BusinessException(500, "保存证据文件失败");
        }

        final Path savedFile = target;
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCompletion(int status) {
                    if (status != STATUS_COMMITTED) deleteQuietly(savedFile);
                }
            });
        }
        try {
            ExecutionAttachmentInsertDTO insert = new ExecutionAttachmentInsertDTO();
            insert.setExecutionId(executionId);
            insert.setAttachmentType(type);
            insert.setFileName(originalName);
            insert.setRelativePath(relativeName.replace('\\', '/'));
            insert.setMimeType(mimeType);
            insert.setFileSize((long) content.length);
            insert.setSha256(sha256(content));
            insert.setCreatedBy(normalizeActor(createdBy));
            if (mapper.insertAttachment(insert) != 1 || insert.getId() == null) {
                throw new BusinessException(500, "保存证据文件记录失败");
            }
            Map<String, Object> result = new HashMap<String, Object>();
            result.put("id", insert.getId());
            result.put("executionId", executionId);
            result.put("attachmentType", type);
            result.put("fileName", originalName);
            result.put("mimeType", mimeType);
            result.put("fileSize", (long) content.length);
            result.put("sha256", insert.getSha256());
            result.put("createdBy", insert.getCreatedBy());
            return result;
        } catch (RuntimeException exception) {
            deleteQuietly(savedFile);
            throw exception;
        }
    }

    @Transactional
    public ExecutionAttachmentFile download(Long taskId, Long executionId, Long attachmentId) {
        Map<String, Object> execution = mapper.selectExecutionForUpdate(taskId, executionId);
        if (execution == null) throw notFound("执行任务或执行记录不存在");
        Map<String, Object> attachment = mapper.selectAttachmentById(attachmentId);
        if (attachment == null || !executionId.equals(asLong(attachment.get("executionId")))) {
            throw notFound("证据文件不存在");
        }
        String relativePath = String.valueOf(attachment.get("relativePath"));
        Path root = storageRoot();
        Path relative;
        try {
            relative = Paths.get(relativePath);
        } catch (RuntimeException exception) {
            throw new BusinessException(500, "证据文件记录路径无效");
        }
        if (relative.isAbsolute()) throw new BusinessException(500, "证据文件记录路径无效");
        Path target = root.resolve(relative).normalize();
        if (!target.startsWith(root) || Files.isSymbolicLink(target)
                || !Files.isRegularFile(target, LinkOption.NOFOLLOW_LINKS)) {
            throw notFound("证据文件不存在或已损坏");
        }
        try {
            if (!target.toRealPath().startsWith(root.toRealPath())) {
                throw new BusinessException(500, "证据文件路径越界");
            }
            String fileName = safeFileName(String.valueOf(attachment.get("fileName")));
            String mimeType = MIME_TYPES.get(extensionOf(fileName));
            if (mimeType == null) mimeType = "application/octet-stream";
            Object size = attachment.get("fileSize");
            long fileSize = size instanceof Number ? ((Number) size).longValue()
                    : Files.size(target);
            return new ExecutionAttachmentFile(target, fileName, mimeType, fileSize);
        } catch (IOException exception) {
            throw new BusinessException(500, "读取证据文件失败");
        }
    }

    private Path storageRoot() {
        try {
            Path root = Paths.get(storageDirectory).toAbsolutePath().normalize();
            Files.createDirectories(root);
            return root;
        } catch (IOException | RuntimeException exception) {
            throw new BusinessException(500, "证据文件存储目录不可用");
        }
    }

    private String normalizeType(String value) {
        String type = value == null ? "OTHER" : value.trim().toUpperCase(Locale.ROOT);
        if (!Arrays.asList("SCREENSHOT", "LOG", "REQUEST", "RESPONSE", "OTHER").contains(type)) {
            throw badRequest("证据类型不合法");
        }
        return type;
    }
    private String normalizeActor(String value) {
        String actor = value == null ? "local-user" : value.trim();
        if (actor.isEmpty()) actor = "local-user";
        if (actor.length() > 64) throw badRequest("上传人标识不能超过 64 个字符");
        return actor.replaceAll("[\\p{Cntrl}]", "");
    }

    private String safeFileName(String value) {
        if (value == null || value.trim().isEmpty()) throw badRequest("文件名不能为空");
        String name = value.replace('\\', '/');
        name = name.substring(name.lastIndexOf('/') + 1).replaceAll("[\\p{Cntrl}]", "");
        name = name.replaceAll("[^\\p{L}\\p{N}._() -]", "_").trim();
        if (name.isEmpty() || ".".equals(name) || "..".equals(name)) throw badRequest("文件名不合法");
        if (name.length() > 255) name = name.substring(name.length() - 255);
        return name;
    }

    private String extensionOf(String name) {
        int dot = name.lastIndexOf('.');
        if (dot <= 0 || dot == name.length() - 1) return "";
        return name.substring(dot + 1).toLowerCase(Locale.ROOT);
    }
    private void validateContent(String extension, byte[] bytes) {
        boolean valid;
        if ("png".equals(extension)) {
            valid = bytes.length >= 8 && (bytes[0] & 0xff) == 0x89 && bytes[1] == 0x50
                    && bytes[2] == 0x4e && bytes[3] == 0x47;
        } else if ("jpg".equals(extension) || "jpeg".equals(extension)) {
            valid = bytes.length >= 3 && (bytes[0] & 0xff) == 0xff && (bytes[1] & 0xff) == 0xd8
                    && (bytes[2] & 0xff) == 0xff;
        } else if ("gif".equals(extension)) {
            String signature = bytes.length < 6 ? "" : new String(bytes, 0, 6, StandardCharsets.US_ASCII);
            valid = "GIF87a".equals(signature) || "GIF89a".equals(signature);
        } else if ("webp".equals(extension)) {
            valid = bytes.length >= 12 && "RIFF".equals(new String(bytes, 0, 4, StandardCharsets.US_ASCII))
                    && "WEBP".equals(new String(bytes, 8, 4, StandardCharsets.US_ASCII));
        } else if ("pdf".equals(extension)) {
            valid = bytes.length >= 5 && "%PDF-".equals(new String(bytes, 0, 5, StandardCharsets.US_ASCII));
        } else {
            try {
                StandardCharsets.UTF_8.newDecoder().onMalformedInput(CodingErrorAction.REPORT)
                        .decode(ByteBuffer.wrap(bytes));
                valid = true;
                for (byte value : bytes) if (value == 0) valid = false;
            } catch (Exception exception) { valid = false; }
        }
        if (!valid) throw badRequest("文件内容与扩展名不匹配或文件编码不受支持");
    }
    private String sha256(byte[] content) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(content);
            StringBuilder result = new StringBuilder(64);
            for (byte value : digest) result.append(String.format("%02x", value & 0xff));
            return result.toString();
        } catch (Exception exception) {
            throw new BusinessException(500, "计算证据文件摘要失败");
        }
    }

    private Long asLong(Object value) {
        return value instanceof Number ? ((Number) value).longValue()
                : value == null ? null : Long.valueOf(String.valueOf(value));
    }

    private void deleteQuietly(Path path) {
        try { Files.deleteIfExists(path); } catch (IOException ignored) { }
    }

    private BusinessException badRequest(String message) {
        return new BusinessException(HttpStatus.BAD_REQUEST.value(), message);
    }

    private BusinessException notFound(String message) {
        return new BusinessException(HttpStatus.NOT_FOUND.value(), message);
    }
}
