package com.devprocess.manager.requirement.service;

import com.devprocess.manager.common.exception.BusinessException;
import com.devprocess.manager.common.web.PageResult;
import com.devprocess.manager.requirement.dto.*;
import com.devprocess.manager.requirement.mapper.RequirementDesignMapper;
import com.devprocess.manager.requirement.mapper.RequirementMapper;
import com.devprocess.manager.version.dto.VersionDTO;
import com.devprocess.manager.version.mapper.VersionMapper;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;
import java.util.Arrays;
import java.util.List;
import java.util.Locale;

@Service
public class RequirementService {
    private static final List<String> STATUSES = Arrays.asList(
            "DRAFT", "CONFIRMED", "DEVELOPING", "COMPLETED", "CANCELLED");
    private static final List<String> PRIORITIES = Arrays.asList("LOW", "MEDIUM", "HIGH", "URGENT");
    private static final List<String> DESIGN_STATUSES = Arrays.asList(
            "DRAFT", "IN_REVIEW", "APPROVED", "REJECTED", "SUPERSEDED");
    private final RequirementMapper requirementMapper;
    private final RequirementDesignMapper designMapper;
    private final VersionMapper versionMapper;

    public RequirementService(RequirementMapper requirementMapper,
            RequirementDesignMapper designMapper, VersionMapper versionMapper) {
        this.requirementMapper = requirementMapper;
        this.designMapper = designMapper;
        this.versionMapper = versionMapper;
    }
    public PageResult<RequirementDTO> page(Long versionId, String keyword, String status,
            String priority, int pageNum, int pageSize) {
        int page = Math.max(pageNum, 1);
        int size = Math.min(Math.max(pageSize, 1), 100);
        String key = StringUtils.hasText(keyword) ? keyword.trim() : null;
        String state = normalizeUpper(status);
        String level = normalizeUpper(priority);
        List<RequirementDTO> list = requirementMapper.selectPage(
                versionId, key, state, level, (page - 1) * size, size);
        long total = requirementMapper.countPage(versionId, key, state, level);
        return new PageResult<RequirementDTO>(list, total, page, size);
    }

    public RequirementDTO get(Long id) {
        RequirementDTO requirement = requirementMapper.selectById(id);
        if (requirement == null) {
            throw new BusinessException(HttpStatus.NOT_FOUND.value(), "需求不存在");
        }
        return requirement;
    }

    @Transactional
    public RequirementDTO create(RequirementSaveRequest request) {
        normalize(request);
        ensureVersionWritable(request.getVersionId());
        ensureUnique(request.getVersionId(), request.getRequirementNo(), null);
        requirementMapper.insert(request);
        return get(request.getId());
    }

    @Transactional
    public RequirementDTO update(Long id, RequirementSaveRequest request) {
        RequirementDTO existing = get(id);
        normalize(request);
        if (!existing.getVersionId().equals(request.getVersionId())) {
            throw new BusinessException(HttpStatus.BAD_REQUEST.value(), "需求所属版本创建后不可变更");
        }
        ensureVersionWritable(request.getVersionId());
        ensureUnique(request.getVersionId(), request.getRequirementNo(), id);
        requirementMapper.update(id, request);
        return get(id);
    }
    public List<RequirementDesignDTO> designs(Long requirementId) {
        get(requirementId);
        return designMapper.selectByRequirement(requirementId);
    }

    public RequirementDesignDTO getDesign(Long requirementId, Long designId) {
        get(requirementId);
        RequirementDesignDTO design = designMapper.selectById(requirementId, designId);
        if (design == null) {
            throw new BusinessException(HttpStatus.NOT_FOUND.value(), "详细设计版本不存在");
        }
        return design;
    }

    @Transactional
    public RequirementDesignDTO createDesign(Long requirementId, RequirementDesignSaveRequest request) {
        // Lock the parent requirement so concurrent submissions receive sequential revision numbers.
        RequirementDTO requirement = requirementMapper.selectByIdForUpdate(requirementId);
        if (requirement == null) {
            throw new BusinessException(HttpStatus.NOT_FOUND.value(), "需求不存在");
        }
        ensureVersionWritable(requirement.getVersionId());
        normalize(request);
        Integer latest = designMapper.selectMaxRevisionNo(requirementId);
        int revisionNo = latest == null ? 1 : latest + 1;
        designMapper.insert(requirementId, revisionNo, request);
        return getDesign(requirementId,
                designMapper.selectByRequirement(requirementId).get(0).getId());
    }

    private void ensureVersionWritable(Long versionId) {
        VersionDTO version = versionMapper.selectById(versionId);
        if (version == null) {
            throw new BusinessException(HttpStatus.BAD_REQUEST.value(), "所属版本不存在");
        }
        if ("ARCHIVED".equals(version.getStatus())) {
            throw new BusinessException(HttpStatus.BAD_REQUEST.value(), "已归档版本不能新增或修改需求");
        }
    }

    private void ensureUnique(Long versionId, String no, Long excludeId) {
        if (requirementMapper.countByVersionAndNo(versionId, no, excludeId) > 0) {
            throw new BusinessException(HttpStatus.CONFLICT.value(), "该版本下需求编号已存在");
        }
    }
    private void normalize(RequirementSaveRequest request) {
        request.setRequirementNo(request.getRequirementNo().trim());
        request.setTitle(request.getTitle().trim());
        request.setRequirementType(trim(request.getRequirementType()));
        request.setOwnerName(trim(request.getOwnerName()));
        request.setStatus(StringUtils.hasText(request.getStatus())
                ? request.getStatus().trim().toUpperCase(Locale.ROOT) : "DRAFT");
        request.setPriority(StringUtils.hasText(request.getPriority())
                ? request.getPriority().trim().toUpperCase(Locale.ROOT) : "MEDIUM");
        if (!STATUSES.contains(request.getStatus())) {
            throw new BusinessException(HttpStatus.BAD_REQUEST.value(), "需求状态不合法");
        }
        if (!PRIORITIES.contains(request.getPriority())) {
            throw new BusinessException(HttpStatus.BAD_REQUEST.value(), "需求优先级不合法");
        }
        if (request.getSortOrder() == null) request.setSortOrder(0);
    }

    private void normalize(RequirementDesignSaveRequest request) {
        request.setDesignType(StringUtils.hasText(request.getDesignType())
                ? request.getDesignType().trim().toUpperCase(Locale.ROOT) : "GENERAL");
        request.setTitle(request.getTitle().trim());
        request.setAttachmentPath(trim(request.getAttachmentPath()));
        request.setAuthorName(trim(request.getAuthorName()));
        request.setStatus(StringUtils.hasText(request.getStatus())
                ? request.getStatus().trim().toUpperCase(Locale.ROOT) : "DRAFT");
        if (!DESIGN_STATUSES.contains(request.getStatus())) {
            throw new BusinessException(HttpStatus.BAD_REQUEST.value(), "详细设计状态不合法");
        }
    }

    private String normalizeUpper(String value) {
        return StringUtils.hasText(value) ? value.trim().toUpperCase(Locale.ROOT) : null;
    }

    private String trim(String value) {
        return StringUtils.hasText(value) ? value.trim() : null;
    }
}