package com.devprocess.manager.version.service;

import com.devprocess.manager.common.exception.BusinessException;
import com.devprocess.manager.common.web.PageResult;
import com.devprocess.manager.project.dto.ProjectDTO;
import com.devprocess.manager.project.mapper.ProjectMapper;
import com.devprocess.manager.version.dto.VersionDTO;
import com.devprocess.manager.version.dto.VersionSaveRequest;
import com.devprocess.manager.version.mapper.VersionMapper;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;
import java.time.LocalDateTime;
import java.util.Arrays;
import java.util.List;
import java.util.Locale;

@Service
public class VersionService {
    private static final List<String> STATUSES = Arrays.asList(
            "PLANNING", "DEVELOPING", "TESTING", "RELEASED", "ARCHIVED");

    private final VersionMapper versionMapper;
    private final ProjectMapper projectMapper;


    public VersionService(VersionMapper versionMapper, ProjectMapper projectMapper) {
        this.versionMapper = versionMapper;
        this.projectMapper = projectMapper;
    }

    public PageResult<VersionDTO> page(Long projectId, String keyword, String status,
                                       int pageNum, int pageSize) {
        int page = Math.max(pageNum, 1);
        int size = Math.min(Math.max(pageSize, 1), 100);
        String key = StringUtils.hasText(keyword) ? keyword.trim() : null;
        String state = StringUtils.hasText(status) ? status.trim().toUpperCase(Locale.ROOT) : null;
        List<VersionDTO> list = versionMapper.selectPage(
                projectId, key, state, (page - 1) * size, size);
        long total = versionMapper.countPage(projectId, key, state);
        return new PageResult<VersionDTO>(list, total, page, size);
    }

    public VersionDTO get(Long id) {
        VersionDTO version = versionMapper.selectById(id);
        if (version == null) {
            throw new BusinessException(HttpStatus.NOT_FOUND.value(), "版本不存在");
        }
        return version;
    }

    @Transactional
    public VersionDTO create(VersionSaveRequest request) {
        normalize(request);
        ensureProjectExists(request.getProjectId());
        ensureUnique(request.getProjectId(), request.getVersionNo(), null);
        if ("RELEASED".equals(request.getStatus()) && request.getReleasedAt() == null) {
            request.setReleasedAt(LocalDateTime.now());
        }
        versionMapper.insert(request);
        return get(request.getId());
    }
    @Transactional
    public VersionDTO update(Long id, VersionSaveRequest request) {
        VersionDTO existing = get(id);
        normalize(request);
        ensureProjectExists(request.getProjectId());
        ensureUnique(request.getProjectId(), request.getVersionNo(), id);
        if (request.getReleasedAt() == null) {
            request.setReleasedAt(existing.getReleasedAt());
            if ("RELEASED".equals(request.getStatus()) && request.getReleasedAt() == null) {
                request.setReleasedAt(LocalDateTime.now());
            }
        }
        versionMapper.update(id, request);
        return get(id);
    }

    private void ensureProjectExists(Long projectId) {
        ProjectDTO project = projectMapper.selectById(projectId);
        if (project == null) {
            throw new BusinessException(HttpStatus.BAD_REQUEST.value(), "所属项目不存在");
        }
        if (!"ACTIVE".equals(project.getStatus())) {
            throw new BusinessException(HttpStatus.BAD_REQUEST.value(), "停用项目不能新增或调整版本");
        }
    }

    private void ensureUnique(Long projectId, String versionNo, Long excludeId) {
        if (versionMapper.countByProjectAndNo(projectId, versionNo, excludeId) > 0) {
            throw new BusinessException(HttpStatus.CONFLICT.value(), "该项目下版本号已存在");
        }
    }

    private void normalize(VersionSaveRequest request) {
        request.setVersionNo(request.getVersionNo().trim());
        request.setVersionName(trim(request.getVersionName()));
        request.setDescription(trim(request.getDescription()));
        request.setStatus(StringUtils.hasText(request.getStatus())
                ? request.getStatus().trim().toUpperCase(Locale.ROOT) : "PLANNING");
        if (!STATUSES.contains(request.getStatus())) {
            throw new BusinessException(HttpStatus.BAD_REQUEST.value(), "版本状态不合法");
        }
        if (request.getPlannedStartDate() != null && request.getPlannedReleaseDate() != null
                && request.getPlannedStartDate().isAfter(request.getPlannedReleaseDate())) {
            throw new BusinessException(HttpStatus.BAD_REQUEST.value(), "计划开始日期不能晚于计划发布日期");
        }
    }

    private String trim(String value) {
        return StringUtils.hasText(value) ? value.trim() : null;
    }
}