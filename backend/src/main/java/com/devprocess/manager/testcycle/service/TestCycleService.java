package com.devprocess.manager.testcycle.service;

import com.devprocess.manager.common.exception.BusinessException;
import com.devprocess.manager.common.web.PageResult;
import com.devprocess.manager.environment.dto.EnvironmentDTO;
import com.devprocess.manager.environment.mapper.EnvironmentMapper;
import com.devprocess.manager.execution.service.ExecutionTaskService;
import com.devprocess.manager.testcase.dto.TestCaseDTO;
import com.devprocess.manager.testcase.dto.TestCaseRevisionDTO;
import com.devprocess.manager.testcase.dto.TestCaseStepDTO;
import com.devprocess.manager.testcase.mapper.TestCaseMapper;
import com.devprocess.manager.testcycle.dto.*;
import com.devprocess.manager.testcycle.mapper.TestCycleMapper;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

@Service
public class TestCycleService {
    private static final List<String> STAGES = Arrays.asList(
            "LOCAL_DEV", "INTEGRATION_TEST", "REGRESSION", "PRE_RELEASE", "PRODUCTION");
    private static final List<String> STATUSES = Arrays.asList(
            "PLANNED", "RUNNING", "COMPLETED", "ABORTED");

    private final TestCycleMapper mapper;
    private final TestCaseMapper testCaseMapper;
    private final EnvironmentMapper environmentMapper;
    private final ExecutionTaskService executionTaskService;
    private final ObjectMapper objectMapper;

    public TestCycleService(TestCycleMapper mapper, TestCaseMapper testCaseMapper,
            EnvironmentMapper environmentMapper, ExecutionTaskService executionTaskService,
            ObjectMapper objectMapper) {
        this.mapper = mapper;
        this.testCaseMapper = testCaseMapper;
        this.environmentMapper = environmentMapper;
        this.executionTaskService = executionTaskService;
        this.objectMapper = objectMapper;
    }

    public PageResult<TestCycleSummaryDTO> page(Long versionId, Long environmentId,
            String status, String keyword, int pageNum, int pageSize) {
        int page = Math.max(pageNum, 1);
        int size = Math.min(Math.max(pageSize, 1), 100);
        String state = upper(status);
        if (state != null && !STATUSES.contains(state)) throw badRequest("测试轮次状态筛选条件不合法");
        String key = trim(keyword);
        List<TestCycleSummaryDTO> rows = mapper.selectPage(
                versionId, environmentId, state, key, (page - 1) * size, size);
        long total = mapper.countPage(versionId, environmentId, state, key);
        return new PageResult<TestCycleSummaryDTO>(rows, total, page, size);
    }

    public TestCycleDTO get(Long id) {
        TestCycleDTO cycle = mapper.selectById(id);
        if (cycle == null) throw notFound("测试轮次不存在");
        List<TestCycleCaseDTO> cases = mapper.selectCases(id);
        for (TestCycleCaseDTO item : cases) {
            item.setRequirements(mapper.selectCaseRequirements(item.getId()));
        }
        cycle.setCases(cases);
        return cycle;
    }

    @Transactional
    public TestCycleDTO create(TestCycleSaveRequest request) {
        normalize(request);
        if (mapper.selectVersionIdForUpdate(request.getVersionId()) == null) {
            throw badRequest("所属版本不存在");
        }
        EnvironmentDTO environment = requireActiveEnvironment(request.getEnvironmentId());
        int cycleNo = mapper.selectNextCycleNo(request.getVersionId());
        String environmentSnapshot = environmentSnapshot(environment);
        mapper.insertCycle(request, cycleNo, environmentSnapshot, request.getScopeJson());
        if (request.getId() == null) throw new BusinessException(500, "创建测试轮次失败：未返回主键");
        captureCases(request.getId(), request.getVersionId(), request.getCaseIds(), 0);
        return get(request.getId());
    }

    @Transactional
    public TestCycleDTO update(Long id, TestCycleUpdateRequest request) {
        Map<String, Object> current = mapper.selectCycleForUpdate(id);
        if (current == null) throw notFound("测试轮次不存在");
        if (!"PLANNED".equals(current.get("status"))) {
            throw badRequest("只有计划中的测试轮次允许修改配置");
        }
        normalize(request);
        EnvironmentDTO environment = requireActiveEnvironment(request.getEnvironmentId());
        mapper.updateCycle(id, request, environmentSnapshot(environment), request.getScopeJson());
        return get(id);
    }

    @Transactional
    public TestCycleDTO addCases(Long id, TestCycleCasesRequest request) {
        Map<String, Object> current = mapper.selectCycleForUpdate(id);
        if (current == null) throw notFound("测试轮次不存在");
        if (!"PLANNED".equals(current.get("status"))) {
            throw badRequest("测试轮次开始后不能再增加测试用例");
        }
        Long versionId = numberValue(current.get("versionId"));
        List<Long> caseIds = normalizeCaseIds(request.getCaseIds());
        // 不能用当前数量作为 sequenceNo：计划中的用例允许删除，删除后数量可能落回已有序号。
        int sequence = mapper.selectNextCaseSequence(id);
        captureCases(id, versionId, caseIds, sequence);
        return get(id);
    }

    @Transactional
    public TestCycleDTO removeCase(Long id, Long cycleCaseId) {
        Map<String, Object> current = mapper.selectCycleForUpdate(id);
        if (current == null) throw notFound("测试轮次不存在");
        if (!"PLANNED".equals(current.get("status"))) {
            throw badRequest("测试轮次开始后不能移除测试用例");
        }
        mapper.deleteCaseRequirements(id, cycleCaseId);
        if (mapper.deleteCycleCase(id, cycleCaseId) == 0) {
            throw notFound("该测试用例不属于当前轮次");
        }
        return get(id);
    }

    @Transactional
    public TestCycleDTO start(Long id) {
        Map<String, Object> current = mapper.selectCycleForUpdate(id);
        if (current == null) throw notFound("测试轮次不存在");
        if (!"PLANNED".equals(current.get("status"))) {
            throw badRequest("只有计划中的测试轮次可以开始");
        }
        if (mapper.selectCaseCount(id) == 0) {
            throw badRequest("测试轮次至少需要一条测试用例才能开始");
        }
        mapper.updateStatus(id, "RUNNING", true, false);
        return get(id);
    }

    @Transactional
    public TestCycleDTO abort(Long id) {
        // 先锁定轮次行，阻止新的任务创建或开始；随后在同一事务中取消所有活动根任务。
        Map<String, Object> current = mapper.selectCycleForUpdate(id);
        if (current == null) throw notFound("测试轮次不存在");
        String status = String.valueOf(current.get("status"));
        if (!"PLANNED".equals(status) && !"RUNNING".equals(status)) {
            throw badRequest("当前测试轮次状态不允许终止");
        }
        if (mapper.updateStatus(id, "ABORTED", false, true) != 1) {
            throw new BusinessException(HttpStatus.CONFLICT.value(), "测试轮次状态已变化，请刷新后重试");
        }
        executionTaskService.cancelActiveTasksForAbortedCycle(
                id, "测试轮次已终止", "system");
        return get(id);
    }

    private void normalize(TestCycleSaveRequest request) {
        request.setCycleName(request.getCycleName().trim());
        request.setCycleStage(upper(request.getCycleStage()));
        request.setCodeVersion(request.getCodeVersion().trim());
        request.setGitBranch(trim(request.getGitBranch()));
        request.setGitCommit(trim(request.getGitCommit()));
        request.setBuildNo(trim(request.getBuildNo()));
        request.setDescription(trim(request.getDescription()));
        request.setCreatedBy(StringUtils.hasText(request.getCreatedBy())
                ? request.getCreatedBy().trim() : "local-user");
        request.setScopeJson(normalizeScopeJson(request.getScopeJson()));
        if (!STAGES.contains(request.getCycleStage())) throw badRequest("测试轮次阶段不合法");
        request.setCaseIds(normalizeCaseIds(request.getCaseIds()));
    }

    private void normalize(TestCycleUpdateRequest request) {
        request.setCycleName(request.getCycleName().trim());
        request.setCycleStage(upper(request.getCycleStage()));
        request.setCodeVersion(request.getCodeVersion().trim());
        request.setGitBranch(trim(request.getGitBranch()));
        request.setGitCommit(trim(request.getGitCommit()));
        request.setBuildNo(trim(request.getBuildNo()));
        request.setDescription(trim(request.getDescription()));
        request.setScopeJson(normalizeScopeJson(request.getScopeJson()));
        if (!STAGES.contains(request.getCycleStage())) throw badRequest("测试轮次阶段不合法");
    }

    private List<Long> normalizeCaseIds(List<Long> ids) {
        if (ids == null || ids.isEmpty()) throw badRequest("测试轮次至少需要选择一条测试用例");
        Set<Long> unique = new LinkedHashSet<Long>();
        for (Long id : ids) {
            if (id == null || id <= 0) throw badRequest("测试用例编号不合法");
            unique.add(id);
        }
        if (unique.isEmpty()) throw badRequest("测试轮次至少需要选择一条测试用例");
        return new ArrayList<Long>(unique);
    }

    private String normalizeScopeJson(String json) {
        if (!StringUtils.hasText(json)) return null;
        try {
            JsonNode node = objectMapper.readTree(json);
            if (!node.isObject()) throw badRequest("测试范围必须是 JSON 对象");
            return objectMapper.writeValueAsString(node);
        } catch (BusinessException exception) {
            throw exception;
        } catch (Exception exception) {
            throw badRequest("测试范围必须是合法 JSON");
        }
    }

    private EnvironmentDTO requireActiveEnvironment(Long environmentId) {
        EnvironmentDTO environment = environmentMapper.selectByIdForUpdate(environmentId);
        if (environment == null) throw badRequest("所选测试环境不存在");
        if (!Boolean.TRUE.equals(environment.getActive())) {
            throw badRequest("已停用的测试环境不能用于新建或修改测试轮次");
        }
        return environment;
    }

    private String environmentSnapshot(EnvironmentDTO environment) {
        Map<String, Object> snapshot = new LinkedHashMap<String, Object>();
        snapshot.put("environmentId", environment.getId());
        snapshot.put("environmentCode", environment.getEnvironmentCode());
        snapshot.put("environmentName", environment.getEnvironmentName());
        snapshot.put("environmentType", environment.getEnvironmentType());
        snapshot.put("baseUrl", environment.getBaseUrl());
        snapshot.put("apiBaseUrl", environment.getApiBaseUrl());
        snapshot.put("authType", environment.getAuthType());
        snapshot.put("credentialRef", environment.getCredentialRef());
        // 保存经过敏感字段校验的非敏感配置，确保轮次快照不受环境后续修改影响。
        snapshot.put("configJson", environment.getConfigJson());
        return writeJson(snapshot, "环境快照序列化失败");
    }

    private void captureCases(Long cycleId, Long versionId, List<Long> caseIds, int sequenceStart) {
        List<Long> normalizedIds = normalizeCaseIds(caseIds);
        int sequence = sequenceStart;
        for (Long caseId : normalizedIds) {
            if (mapper.countCycleCase(cycleId, caseId) > 0) {
                throw new BusinessException(HttpStatus.CONFLICT.value(), "测试用例已存在于当前轮次：" + caseId);
            }
            TestCaseDTO lockedCase = testCaseMapper.selectByIdForUpdate(caseId);
            if (lockedCase == null) throw badRequest("测试用例不存在：" + caseId);
            if (!"ACTIVE".equals(lockedCase.getStatus())) {
                throw badRequest("停用的测试用例不能加入测试轮次：" + lockedCase.getCaseNo());
            }
            TestCaseDTO currentCase = testCaseMapper.selectById(caseId);
            if (currentCase == null || currentCase.getCurrentRevisionId() == null) {
                throw badRequest("测试用例没有可用的当前修订版本：" + caseId);
            }
            TestCaseRevisionDTO revision = testCaseMapper.selectRevisionById(
                    caseId, currentCase.getCurrentRevisionId());
            if (revision == null) throw badRequest("测试用例当前修订版本不存在：" + caseId);

            List<TestCaseStepDTO> steps = parseSteps(revision.getStepsJson());
            Map<String, Object> snapshot = new LinkedHashMap<String, Object>();
            snapshot.put("testCaseId", caseId);
            snapshot.put("caseNo", currentCase.getCaseNo());
            snapshot.put("title", currentCase.getTitle());
            snapshot.put("revisionId", revision.getId());
            snapshot.put("revisionNo", revision.getRevisionNo());
            snapshot.put("preconditions", revision.getPreconditions());
            snapshot.put("steps", steps);
            snapshot.put("expectedResult", revision.getExpectedResult());
            snapshot.put("testType", revision.getTestType());
            snapshot.put("priority", revision.getPriority());
            snapshot.put("executionMode", revision.getExecutionMode());
            snapshot.put("scriptId", revision.getScriptId());
            snapshot.put("scriptRevisionId", revision.getScriptRevisionId());
            snapshot.put("scriptVersion", revision.getScriptVersion());
            snapshot.put("aiInstruction", revision.getAiInstruction());
            snapshot.put("testData", parseOptionalJson(revision.getTestDataJson()));
            snapshot.put("changeNote", revision.getChangeNote());
            snapshot.put("createdBy", revision.getCreatedBy());
            snapshot.put("revisionCreatedAt", revision.getCreatedAt());

            mapper.insertCycleCase(cycleId, caseId, revision.getId(),
                    writeJson(snapshot, "测试用例快照序列化失败"),
                    revision.getExecutionMode(), sequence++);
            Long cycleCaseId = mapper.selectCycleCaseId(cycleId, caseId);
            if (cycleCaseId == null) throw new BusinessException(500, "创建轮次用例快照失败");

            List<Map<String, Object>> requirements =
                    mapper.selectRequirementsForCycle(caseId, versionId);
            for (Map<String, Object> requirement : requirements) {
                saveRequirementSnapshot(cycleCaseId, requirement);
            }
        }
    }

    private void saveRequirementSnapshot(Long cycleCaseId, Map<String, Object> source) {
        Map<String, Object> requirement = new LinkedHashMap<String, Object>();
        requirement.put("requirementId", source.get("requirementId"));
        requirement.put("requirementNo", source.get("requirementNo"));
        requirement.put("title", source.get("title"));
        requirement.put("requirementType", source.get("requirementType"));
        requirement.put("contentMarkdown", source.get("contentMarkdown"));
        requirement.put("status", source.get("status"));
        requirement.put("priority", source.get("priority"));
        requirement.put("ownerName", source.get("ownerName"));
        requirement.put("versionNo", source.get("versionNo"));
        requirement.put("projectCode", source.get("projectCode"));
        requirement.put("projectName", source.get("projectName"));

        String designJson = null;
        if (source.get("designId") != null) {
            Map<String, Object> design = new LinkedHashMap<String, Object>();
            design.put("id", source.get("designId"));
            design.put("revisionNo", source.get("designRevisionNo"));
            design.put("designType", source.get("designType"));
            design.put("title", source.get("designTitle"));
            design.put("contentMarkdown", source.get("designContentMarkdown"));
            design.put("status", source.get("designStatus"));
            design.put("authorName", source.get("designAuthorName"));
            design.put("createdAt", source.get("designCreatedAt"));
            designJson = writeJson(design, "需求详细设计快照序列化失败");
        }
        mapper.insertCycleCaseRequirement(cycleCaseId,
                numberValue(source.get("requirementId")),
                String.valueOf(source.get("coverageType")),
                writeJson(requirement, "需求快照序列化失败"), designJson);
    }

    private List<TestCaseStepDTO> parseSteps(String json) {
        try {
            return objectMapper.readValue(json, new TypeReference<List<TestCaseStepDTO>>() { });
        } catch (Exception exception) {
            throw new BusinessException(500, "测试用例步骤快照解析失败");
        }
    }

    private Object parseOptionalJson(String json) {
        if (!StringUtils.hasText(json)) return null;
        try {
            return objectMapper.readTree(json);
        } catch (Exception exception) {
            throw new BusinessException(500, "测试用例测试数据快照解析失败");
        }
    }

    private String writeJson(Object value, String message) {
        try {
            return objectMapper.writeValueAsString(value);
        } catch (Exception exception) {
            throw new BusinessException(500, message);
        }
    }

    private Long numberValue(Object value) {
        if (value instanceof Number) return ((Number) value).longValue();
        if (value != null) {
            try { return Long.valueOf(String.valueOf(value)); }
            catch (NumberFormatException ignored) { }
        }
        return null;
    }

    private String upper(String value) {
        return StringUtils.hasText(value) ? value.trim().toUpperCase(Locale.ROOT) : null;
    }

    private String trim(String value) {
        return StringUtils.hasText(value) ? value.trim() : null;
    }

    private BusinessException badRequest(String message) {
        return new BusinessException(HttpStatus.BAD_REQUEST.value(), message);
    }

    private BusinessException notFound(String message) {
        return new BusinessException(HttpStatus.NOT_FOUND.value(), message);
    }
}
