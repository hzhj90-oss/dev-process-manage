package com.devprocess.manager.execution.dto;

import java.nio.file.Path;

public class ExecutionAttachmentFile {
    private final Path path;
    private final String fileName;
    private final String mimeType;
    private final long fileSize;

    public ExecutionAttachmentFile(Path path, String fileName, String mimeType, long fileSize) {
        this.path = path;
        this.fileName = fileName;
        this.mimeType = mimeType;
        this.fileSize = fileSize;
    }

    public Path getPath() { return path; }
    public String getFileName() { return fileName; }
    public String getMimeType() { return mimeType; }
    public long getFileSize() { return fileSize; }
}
