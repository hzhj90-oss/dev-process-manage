package com.devprocess.manager.testcase.service;

import com.devprocess.manager.common.exception.BusinessException;
import com.devprocess.manager.common.web.PageResult;
import com.devprocess.manager.testcase.dto.*;
import com.devprocess.manager.testcase.mapper.TestCaseMapper;
import com.devprocess.manager.testscript.dto.TestScriptDTO;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;

@Service
public class TestCaseService {
    private static final List<String> STATUSES = Arrays.asList("ACTIVE", "INACTIVE");
    private static final List<String> TEST_TYPES = Arrays.asList(
            "FUNCTIONAL", "REGRESSION", "INTEGRATION", "API", "UI",
            "PERFORMANCE", "SECURITY", "OTHER");
    private static final List<String> PRIORITIES = Arrays.asList("LOW", "MEDIUM", "HIGH", "URGENT");
    private static final List<String> EXECUTION_MODES = Arrays.asList("MANUAL", "SCRIPT", "AI");

    private final TestCaseMapper mapper;
    private final ObjectMapper objectMapper;

    public TestCaseService(TestCaseMapper mapper, ObjectMapper objectMapper) {
        this.mapper = mapper;
        this.objectMapper = objectMapper;
    }

    public PageResult<TestCaseDTO> page(String keyword, String status, String testType,
            String priority, String executionMode, int pageNum, int pageSize) {
        int page = Math.max(pageNum, 1);
        int size = Math.min(Math.max(pageSize, 1), 100);
        String key = trim(keyword);
        String state = normalizeUpper(status);
        String type = normalizeUpper(testType);
        String level = normalizeUpper(priority);
        String mode = normalizeUpper(executionMode);
        validateFilter(state, STATUSES, "用例状态");
        validateFilter(type, TEST_TYPES, "用例类型");
        validateFilter(level, PRIORITIES, "用例优先级");
        validateFilter(mode, EXECUTION_MODES, "执行方式");
        List<TestCaseDTO> list = mapper.selectPage(
                key, state, type, level, mode, (page - 1) * size, size);
        long total = mapper.countPage(key, state, type, level, mode);
        return new PageResult<TestCaseDTO>(list, total, page, size);
    }

    public TestCaseDTO get(Long id) {
        TestCaseDTO testCase = mapper.selectById(id);
        if (testCase == null) {
            throw new BusinessException(HttpStatus.NOT_FOUND.value(), "测试用例不存在");
        }
        testCase.setRequirements(mapper.selectRequirementsByCase(id));
        if (testCase.getCurrentRevisionId() != null) {
            testCase.setCurrentRevision(getRevision(id, testCase.getCurrentRevisionId()));
        }
        return testCase;
    }

    @Transactional
    public TestCaseDTO create(TestCaseSaveRequest request) {
        normalize(request);
        ensureUnique(request.getCaseNo(), null);
        ensureRequirementsExist(request.getRequirementIds());
        validateExecutionMode(request);
        String stepsJson = serializeSteps(request.getSteps());
        mapper.insertMain(request);
        Long caseId = request.getId();
        if (caseId == null) {
            throw new BusinessException(HttpStatus.INTERNAL_SERVER_ERROR.value(), "创建用例失败：未返回主键");
        }
        mapper.insertRevision(caseId, 1, request, stepsJson);
        saveRequirementLinks(caseId, request.getRequirementIds());
        return get(caseId);
    }

    @Transactional
    public TestCaseDTO update(Long id, TestCaseSaveRequest request) {
        // Lock the main record to ensure concurrent edits receive sequential revision numbers.
        TestCaseDTO existing = mapper.selectByIdForUpdate(id);
        if (existing == null) {
            throw new BusinessException(HttpStatus.NOT_FOUND.value(), "测试用例不存在");
        }
        normalize(request);
        ensureUnique(request.getCaseNo(), id);
        ensureRequirementsExist(request.getRequirementIds());
        validateExecutionMode(request);
        int nextRevision = existing.getCurrentRevisionNo() == null
                ? 1 : existing.getCurrentRevisionNo() + 1;
        String stepsJson = serializeSteps(request.getSteps());
        mapper.insertRevision(id, nextRevision, request, stepsJson);
        mapper.updateMain(id, request, nextRevision);
        saveRequirementLinks(id, request.getRequirementIds());
        return get(id);
    }

    public List<TestCaseRevisionDTO> revisions(Long caseId) {
        ensureCaseExists(caseId);
        return mapper.selectRevisions(caseId);
    }

    public TestCaseRevisionDTO getRevision(Long caseId, Long revisionId) {
        ensureCaseExists(caseId);
        TestCaseRevisionDTO revision = mapper.selectRevisionById(caseId, revisionId);
        if (revision == null) {
            throw new BusinessException(HttpStatus.NOT_FOUND.value(), "测试用例修订版本不存在");
        }
        revision.setSteps(parseSteps(revision.getStepsJson()));
        return revision;
    }

    public List<TestCaseRequirementDTO> availableRequirements(Long versionId) {
        return mapper.selectAvailableRequirements(versionId);
    }

    public List<TestScriptDTO> scripts() {
        return mapper.selectEnabledScripts();
    }

    private void ensureCaseExists(Long caseId) {
        if (mapper.selectById(caseId) == null) {
            throw new BusinessException(HttpStatus.NOT_FOUND.value(), "测试用例不存在");
        }
    }

    private void ensureUnique(String caseNo, Long excludeId) {
        if (mapper.countByCaseNo(caseNo, excludeId) > 0) {
            throw new BusinessException(HttpStatus.CONFLICT.value(), "测试用例编号已存在");
        }
    }

    private void ensureRequirementsExist(List<Long> requirementIds) {
        if (requirementIds == null || requirementIds.isEmpty()) {
            return;
        }
        for (Long id : requirementIds) {
            if (id == null || id <= 0) {
                throw new BusinessException(HttpStatus.BAD_REQUEST.value(), "关联需求编号不合法");
            }
        }
        Set<Long> uniqueIds = new LinkedHashSet<Long>(requirementIds);
        requirementIds.clear();
        requirementIds.addAll(uniqueIds);
        if (mapper.countRequirementsByIds(requirementIds) != requirementIds.size()) {
            throw new BusinessException(HttpStatus.BAD_REQUEST.value(), "关联需求中存在不存在的记录");
        }
    }

    private void saveRequirementLinks(Long caseId, List<Long> requirementIds) {
        mapper.deleteRequirementsByCase(caseId);
        if (requirementIds == null) {
            return;
        }
        for (Long requirementId : requirementIds) {
            mapper.insertRequirementCase(requirementId, caseId);
        }
    }

    private void validateExecutionMode(TestCaseSaveRequest request) {
        String mode = request.getExecutionMode();
        if ("SCRIPT".equals(mode)) {
            if (request.getScriptId() == null) {
                throw new BusinessException(HttpStatus.BAD_REQUEST.value(), "脚本执行方式必须选择一个已启用的脚本");
            }
            if (mapper.selectEnabledScriptByIdForUpdate(request.getScriptId()) == null) {
                throw new BusinessException(HttpStatus.BAD_REQUEST.value(), "关联脚本不存在或已停用");
            }
            request.setAiInstruction(null);
        } else if ("AI".equals(mode)) {
            if (!StringUtils.hasText(request.getAiInstruction())) {
                throw new BusinessException(HttpStatus.BAD_REQUEST.value(), "ChatGPT 动态执行方式必须填写执行指令");
            }
            if (request.getScriptId() != null) {
                throw new BusinessException(HttpStatus.BAD_REQUEST.value(), "动态执行方式不能同时关联固定脚本");
            }
            request.setAiInstruction(request.getAiInstruction().trim());
        } else {
            if (request.getScriptId() != null) {
                throw new BusinessException(HttpStatus.BAD_REQUEST.value(), "人工执行方式不能关联自动化脚本");
            }
            request.setAiInstruction(null);
        }
    }

    private void normalize(TestCaseSaveRequest request) {
        request.setCaseNo(request.getCaseNo().trim());
        request.setTitle(request.getTitle().trim());
        request.setOwnerName(trim(request.getOwnerName()));
        request.setPreconditions(trim(request.getPreconditions()));
        request.setExpectedResult(request.getExpectedResult().trim());
        request.setStatus(StringUtils.hasText(request.getStatus())
                ? request.getStatus().trim().toUpperCase(Locale.ROOT) : "ACTIVE");
        request.setTestType(StringUtils.hasText(request.getTestType())
                ? request.getTestType().trim().toUpperCase(Locale.ROOT) : "FUNCTIONAL");
        request.setPriority(StringUtils.hasText(request.getPriority())
                ? request.getPriority().trim().toUpperCase(Locale.ROOT) : "MEDIUM");
        request.setExecutionMode(StringUtils.hasText(request.getExecutionMode())
                ? request.getExecutionMode().trim().toUpperCase(Locale.ROOT) : "MANUAL");
        request.setChangeNote(trim(request.getChangeNote()));
        request.setCreatedBy(trim(request.getCreatedBy()));
        request.setTestDataJson(normalizeJson(request.getTestDataJson()));
        if (!STATUSES.contains(request.getStatus())) {
            throw new BusinessException(HttpStatus.BAD_REQUEST.value(), "用例状态不合法");
        }
        if (!TEST_TYPES.contains(request.getTestType())) {
            throw new BusinessException(HttpStatus.BAD_REQUEST.value(), "用例类型不合法");
        }
        if (!PRIORITIES.contains(request.getPriority())) {
            throw new BusinessException(HttpStatus.BAD_REQUEST.value(), "用例优先级不合法");
        }
        if (!EXECUTION_MODES.contains(request.getExecutionMode())) {
            throw new BusinessException(HttpStatus.BAD_REQUEST.value(), "执行方式不合法");
        }
        if (request.getSteps() == null || request.getSteps().isEmpty()) {
            throw new BusinessException(HttpStatus.BAD_REQUEST.value(), "至少需要一个测试步骤");
        }
        for (int i = 0; i < request.getSteps().size(); i++) {
            TestCaseStepDTO step = request.getSteps().get(i);
            if (step == null || !StringUtils.hasText(step.getAction())
                    || !StringUtils.hasText(step.getExpectedResult())) {
                throw new BusinessException(HttpStatus.BAD_REQUEST.value(), "测试步骤的操作和预期结果不能为空");
            }
            step.setStepNo(i + 1);
            step.setAction(step.getAction().trim());
            step.setTestData(trim(step.getTestData()));
            step.setExpectedResult(step.getExpectedResult().trim());
        }
        if (request.getRequirementIds() == null) {
            request.setRequirementIds(new ArrayList<Long>());
        }
    }

    private String normalizeJson(String json) {
        if (!StringUtils.hasText(json)) {
            return null;
        }
        try {
            JsonNode node = objectMapper.readTree(json);
            return objectMapper.writeValueAsString(node);
        } catch (JsonProcessingException exception) {
            throw new BusinessException(HttpStatus.BAD_REQUEST.value(), "测试数据必须是合法的 JSON");
        }
    }

    private String serializeSteps(List<TestCaseStepDTO> steps) {
        try {
            return objectMapper.writeValueAsString(steps);
        } catch (JsonProcessingException exception) {
            throw new BusinessException(HttpStatus.BAD_REQUEST.value(), "测试步骤格式不合法");
        }
    }

    private List<TestCaseStepDTO> parseSteps(String json) {
        try {
            return objectMapper.readValue(json, new TypeReference<List<TestCaseStepDTO>>() { });
        } catch (Exception exception) {
            throw new BusinessException(HttpStatus.INTERNAL_SERVER_ERROR.value(), "测试用例步骤数据损坏");
        }
    }

    private void validateFilter(String value, List<String> allowed, String label) {
        if (value != null && !allowed.contains(value)) {
            throw new BusinessException(HttpStatus.BAD_REQUEST.value(), label + "筛选条件不合法");
        }
    }

    private String normalizeUpper(String value) {
        return StringUtils.hasText(value) ? value.trim().toUpperCase(Locale.ROOT) : null;
    }

    private String trim(String value) {
        return StringUtils.hasText(value) ? value.trim() : null;
    }
}