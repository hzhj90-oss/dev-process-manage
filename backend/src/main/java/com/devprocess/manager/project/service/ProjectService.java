package com.devprocess.manager.project.service;

import com.devprocess.manager.common.exception.BusinessException;
import com.devprocess.manager.common.web.PageResult;
import com.devprocess.manager.project.dto.ProjectDTO;
import com.devprocess.manager.project.dto.ProjectSaveRequest;
import com.devprocess.manager.project.mapper.ProjectMapper;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;
import java.util.List;
import java.util.Locale;

@Service
public class ProjectService {
    private final ProjectMapper projectMapper;

    public ProjectService(ProjectMapper projectMapper) {
        this.projectMapper = projectMapper;
    }

    public PageResult<ProjectDTO> page(String keyword, String status, int pageNum, int pageSize) {
        int page = Math.max(pageNum, 1);
        int size = Math.min(Math.max(pageSize, 1), 100);
        String key = StringUtils.hasText(keyword) ? keyword.trim() : null;
        String state = StringUtils.hasText(status) ? status.trim().toUpperCase(Locale.ROOT) : null;
        List<ProjectDTO> list = projectMapper.selectPage(key, state, (page - 1) * size, size);
        return new PageResult<ProjectDTO>(list, projectMapper.countPage(key, state), page, size);
    }

    public ProjectDTO get(Long id) {
        ProjectDTO project = projectMapper.selectById(id);
        if (project == null) {
            throw new BusinessException(HttpStatus.NOT_FOUND.value(), "项目不存在");
        }
        return project;
    }

    @Transactional
    public ProjectDTO create(ProjectSaveRequest request) {
        normalize(request);
        if (projectMapper.countByCode(request.getProjectCode(), null) > 0) {
            throw new BusinessException(HttpStatus.CONFLICT.value(), "项目编码已存在");
        }
        projectMapper.insert(request);
        return get(request.getId());
    }

    @Transactional
    public ProjectDTO update(Long id, ProjectSaveRequest request) {
        get(id);
        normalize(request);
        if (projectMapper.countByCode(request.getProjectCode(), id) > 0) {
            throw new BusinessException(HttpStatus.CONFLICT.value(), "项目编码已存在");
        }
        projectMapper.update(id, request);
        return get(id);
    }

    private void normalize(ProjectSaveRequest request) {
        request.setProjectCode(request.getProjectCode().trim());
        request.setProjectName(request.getProjectName().trim());
        request.setStatus(StringUtils.hasText(request.getStatus())
                ? request.getStatus().trim().toUpperCase(Locale.ROOT) : "ACTIVE");
        if (!"ACTIVE".equals(request.getStatus()) && !"INACTIVE".equals(request.getStatus())) {
            throw new BusinessException(HttpStatus.BAD_REQUEST.value(), "项目状态只允许 ACTIVE 或 INACTIVE");
        }
        request.setDescription(trim(request.getDescription()));
        request.setRepositoryUrl(trim(request.getRepositoryUrl()));
        request.setMainBranch(trim(request.getMainBranch()));
    }

    private String trim(String value) {
        return StringUtils.hasText(value) ? value.trim() : null;
    }
}