package com.devprocess.manager.execution.service;

import com.devprocess.manager.common.exception.BusinessException;
import com.devprocess.manager.common.web.PageResult;
import com.devprocess.manager.execution.dto.*;
import com.devprocess.manager.execution.mapper.ExecutionTaskMapper;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import java.util.regex.Pattern;

@Service
public class ExecutionTaskService {
    private static final List<String> ACTIVE_TASK_STATUSES = Arrays.asList(
            "PENDING", "RUNNING", "WAITING_HUMAN", "RECOVERY_REQUIRED");
    private static final List<String> RESULTS = Arrays.asList("PASS", "FAIL", "BLOCKED", "SKIPPED");
    private static final List<String> EVENT_TYPES = Arrays.asList(
            "STEP_STARTED", "STEP_COMPLETED", "ASSERTION_PASSED", "ASSERTION_FAILED",
            "LOG", "CHECKPOINT", "WAITING_HUMAN", "HEARTBEAT",
            "API_REQUEST", "API_RESPONSE", "SCREENSHOT", "NOTE");
    private static final Pattern SENSITIVE_KEY = Pattern.compile(
            "(?i)(password|passwd|token|authorization|cookie|secret|api[_-]?key|private[_-]?key|credential)");
    private static final Pattern SENSITIVE_ASSIGNMENT = Pattern.compile(
            "(?i)(\\b(?:password|passwd|(?:access|refresh|id)[_-]?token|token|authorization|cookie|secret|api[_-]?key|private[_-]?key|credential|client[_-]?secret)\\b\\s*[:=]\\s*)(\"[^\"]*\"|'[^']*'|[^\\s,;]+)");
    private static final Pattern BEARER_VALUE = Pattern.compile("(?i)Bearer\\s+[A-Za-z0-9._~+/-]+=*");

    private final ExecutionTaskMapper mapper;
    private final ObjectMapper objectMapper;

    public ExecutionTaskService(ExecutionTaskMapper mapper, ObjectMapper objectMapper) {
        this.mapper = mapper;
        this.objectMapper = objectMapper;
    }

    public PageResult<Map<String, Object>> page(String status, Long cycleId,
            String keyword, int pageNum, int pageSize) {
        int page = Math.max(pageNum, 1);
        int size = Math.min(Math.max(pageSize, 1), 100);
        String state = upper(status);
        if (state != null && !ACTIVE_TASK_STATUSES.contains(state)
                && !Arrays.asList("COMPLETED", "FAILED", "CANCELLED").contains(state)) {
            throw badRequest("执行任务状态筛选条件不合法");
        }
        String key = trim(keyword);
        List<Map<String, Object>> rows = mapper.selectPage(
                state, cycleId, key, (page - 1) * size, size);
        long total = mapper.countPage(state, cycleId, key);
        return new PageResult<Map<String, Object>>(rows, total, page, size);
    }

    /** Read-only task audit search. No original snapshots, event bodies or credentials leave SQL. */
    public PageResult<Map<String, Object>> chatGptAudit(String status, String result,
            String keyword, boolean recoveredOnly, int pageNum, int pageSize) {
        String state = upper(status);
        if (state != null && !ACTIVE_TASK_STATUSES.contains(state)
                && !Arrays.asList("COMPLETED", "FAILED", "CANCELLED").contains(state)) {
            throw badRequest("ChatGPT 审计任务状态不合法");
        }
        String outcome = upper(result);
        if (outcome != null && !RESULTS.contains(outcome)) {
            throw badRequest("ChatGPT 审计执行结果不合法");
        }
        String key = trim(keyword);
        if (key != null && key.length() > 100) {
            throw badRequest("ChatGPT 审计关键字最多 100 个字符");
        }
        if (pageNum < 1 || pageSize < 1 || pageSize > 50) {
            throw badRequest("ChatGPT 审计分页参数不合法（每页最多 50 条）");
        }
        long offset = ((long) pageNum - 1L) * pageSize;
        if (offset > Integer.MAX_VALUE) {
            throw badRequest("ChatGPT 审计分页超出范围");
        }
        List<Map<String, Object>> rows = mapper.selectChatGptAudit(
                state, outcome, key, recoveredOnly, (int) offset, pageSize);
        long total = mapper.countChatGptAudit(state, outcome, key, recoveredOnly);
        return new PageResult<Map<String, Object>>(rows, total, pageNum, pageSize);
    }

    /**
     * Lists immutable AI execution snapshots that are ready for ChatGPT.
     * This is discovery only; start() performs the atomic task claim under row locks.
     */
    @SuppressWarnings("unchecked")
    public List<Map<String, Object>> chatGptQueue(int limit) {
        int size = Math.min(Math.max(limit, 1), 20);
        List<Map<String, Object>> candidates = mapper.selectChatGptClaimableTasks(size);
        List<Map<String, Object>> queue = new ArrayList<Map<String, Object>>();
        for (Map<String, Object> candidate : candidates) {
            Long taskId = numberValue(candidate.get("id"));
            Long candidateExecutionId = numberValue(candidate.get("executionId"));
            if (taskId == null || candidateExecutionId == null) continue;

            Map<String, Object> detail = get(taskId);
            Map<String, Object> task = (Map<String, Object>) detail.get("task");
            if (task == null || !"EXECUTE_CASE".equals(task.get("taskType"))
                    || !"PENDING".equals(task.get("taskStatus"))) continue;

            List<Map<String, Object>> executions = (List<Map<String, Object>>) detail.get("executions");
            if (executions == null || executions.isEmpty()) continue;
            Map<String, Object> execution = executions.get(0);
            if (!candidateExecutionId.equals(numberValue(execution.get("id")))
                    || !"AI".equals(upper(stringValue(execution.get("executionMode"))))
                    || !"CHATGPT".equals(upper(stringValue(execution.get("runnerType"))))
                    || !"QUEUED".equals(execution.get("executionStatus"))) continue;

            JsonNode snapshot = parseJson(stringValue(execution.get("requestSnapshotJson")));
            if (snapshot == null || !snapshot.isObject()) continue;
            Map<String, Object> item = new LinkedHashMap<String, Object>();
            execution.remove("requestSnapshotJson");
            execution.put("requestSnapshot", snapshot);
            item.put("task", task);
            item.put("execution", execution);
            queue.add(item);
        }
        return queue;
    }

    @Transactional
    public Map<String, Object> createCycleTask(Long cycleId, ExecutionTaskCreateRequest request) {
        normalizeCreateRequest(request);
        Map<String, Object> cycle = mapper.selectCycleForUpdate(cycleId);
        if (cycle == null) throw notFound("测试轮次不存在");
        // Replay an already committed request before enforcing the current RUNNING
        // state. Its cycle may have completed since the original POST returned.
        // Both lookup and mutation happen inside the same locked transaction.
        Map<String, Object> existing = mapper.selectByIdempotencyKey(cycleId, request.getIdempotencyKey());
        if (existing != null) {
            if (!"EXECUTE_CYCLE".equals(existing.get("taskType"))) {
                throw conflict("Idempotency-Key 已用于不同的执行任务请求");
            }
            return get(numberValue(existing.get("id")));
        }
        validateRunnableCycle(cycle);

        if (mapper.countActiveCycleTasks(cycleId) > 0) {
            throw conflict("当前轮次已有执行任务，不能重复创建整轮任务");
        }
        List<Map<String, Object>> cases = mapper.selectCycleCasesForUpdate(cycleId, null);
        if (cases == null || cases.isEmpty()) throw badRequest("当前测试轮次没有测试用例");

        validateEnvironmentMode(cycle, cases);
        ExecutionTaskInsertDTO parent = newTask(cycleId, null, null,
                "EXECUTE_CYCLE", request.getIdempotencyKey(), request);
        mapper.insertTask(parent);
        if (parent.getId() == null) throw new BusinessException(500, "创建整轮执行任务失败");

        for (Map<String, Object> cycleCase : cases) {
            createCaseChild(cycleId, parent.getId(), cycle, cycleCase, request);
        }
        return get(parent.getId());
    }

    @Transactional
    public Map<String, Object> createCaseTask(Long cycleId, Long cycleCaseId,
            ExecutionTaskCreateRequest request) {
        normalizeCreateRequest(request);
        Map<String, Object> cycle = mapper.selectCycleForUpdate(cycleId);
        if (cycle == null) throw notFound("测试轮次不存在");
        // The same original request must return the same task even when the
        // cycle has since finished. A new key still requires a RUNNING cycle.
        Map<String, Object> existing = mapper.selectByIdempotencyKey(cycleId, request.getIdempotencyKey());
        if (existing != null) {
            if (!"EXECUTE_CASE".equals(existing.get("taskType"))
                    || !cycleCaseId.equals(numberValue(existing.get("cycleCaseId")))) {
                throw conflict("Idempotency-Key 已用于不同的执行任务请求");
            }
            return get(numberValue(existing.get("id")));
        }
        validateRunnableCycle(cycle);

        if (mapper.countActiveCycleParents(cycleId) > 0) {
            throw conflict("当前轮次已有整轮执行任务，不能再单独执行用例");
        }
        if (mapper.countActiveCaseTasks(cycleId, cycleCaseId) > 0) {
            throw conflict("该测试用例已有未完成的执行任务");
        }
        List<Map<String, Object>> cases = mapper.selectCycleCasesForUpdate(cycleId, cycleCaseId);
        if (cases == null || cases.size() != 1) throw notFound("测试用例不属于当前测试轮次");
        validateEnvironmentMode(cycle, cases);

        ExecutionTaskInsertDTO task = newTask(cycleId, cycleCaseId, null,
                "EXECUTE_CASE", request.getIdempotencyKey(), request);
        mapper.insertTask(task);
        if (task.getId() == null) throw new BusinessException(500, "创建用例执行任务失败");
        createExecution(task.getId(), cycleId, cycle, cases.get(0), request);
        return get(task.getId());
    }

    private void createCaseChild(Long cycleId, Long parentTaskId, Map<String, Object> cycle,
            Map<String, Object> cycleCase, ExecutionTaskCreateRequest request) {
        Long cycleCaseId = numberValue(cycleCase.get("cycleCaseId"));
        ExecutionTaskInsertDTO child = newTask(cycleId, cycleCaseId, parentTaskId,
                "EXECUTE_CASE", null, request);
        mapper.insertTask(child);
        if (child.getId() == null) throw new BusinessException(500, "创建轮次用例子任务失败");
        createExecution(child.getId(), cycleId, cycle, cycleCase, request);
    }

    private void createExecution(Long taskId, Long cycleId, Map<String, Object> cycle,
            Map<String, Object> cycleCase, ExecutionTaskCreateRequest request) {
        Long cycleCaseId = numberValue(cycleCase.get("cycleCaseId"));
        String mode = upper(stringValue(cycleCase.get("executionMode")));
        String runner = resolveRunnerType(mode, stringValue(cycleCase.get("scriptLanguage")));
        ExecutionInsertDTO execution = new ExecutionInsertDTO();
        execution.setCycleCaseId(cycleCaseId);
        execution.setTaskId(taskId);
        execution.setAttemptNo(mapper.selectNextAttemptNo(cycleCaseId));
        execution.setExecutionMode(mode);
        execution.setRunnerType(runner);
        execution.setTriggerSource(request.getTriggerSource());
        execution.setExecutionStatus("QUEUED");
        execution.setExpectedResultSnapshot(sanitizeText(stringValue(cycleCase.get("expectedResult"))));
        Map<String, Object> snapshot = new LinkedHashMap<String, Object>();
        snapshot.put("cycleId", cycleId);
        snapshot.put("cycleCaseId", cycleCaseId);
        snapshot.put("codeVersion", cycle.get("codeVersion"));
        JsonNode environmentSnapshot = parseJson(stringValue(cycle.get("environmentSnapshotJson")));
        JsonNode caseSnapshot = parseJson(stringValue(cycleCase.get("caseSnapshotJson")));
        // 环境配置和用例测试数据可能包含敏感字段；执行快照与事件日志使用同一脱敏规则。
        snapshot.put("environmentSnapshot",
                environmentSnapshot == null ? null : sanitizeNode(environmentSnapshot));
        snapshot.put("caseSnapshot", caseSnapshot == null ? null : sanitizeNode(caseSnapshot));
        snapshot.put("scriptRevisionId", cycleCase.get("scriptRevisionId"));
        snapshot.put("scriptVersion", cycleCase.get("scriptVersion"));
        if (cycleCase.get("scriptRevisionId") != null) {
            Map<String, Object> scriptSnapshot = new LinkedHashMap<String, Object>();
            scriptSnapshot.put("revisionId", cycleCase.get("scriptRevisionId"));
            scriptSnapshot.put("scriptVersion", cycleCase.get("scriptVersion"));
            scriptSnapshot.put("language", cycleCase.get("scriptLanguage"));
            scriptSnapshot.put("runtimeVersion", cycleCase.get("scriptRuntimeVersion"));
            scriptSnapshot.put("sourceType", cycleCase.get("scriptSourceType"));
            scriptSnapshot.put("sourcePath", cycleCase.get("scriptSourcePath"));
            scriptSnapshot.put("sourceContent", cycleCase.get("scriptSourceContent"));
            scriptSnapshot.put("entryPoint", cycleCase.get("scriptEntryPoint"));
            JsonNode scriptArguments = parseJson(stringValue(cycleCase.get("scriptArgumentsJson")));
            scriptSnapshot.put("arguments", scriptArguments);
            // 执行尝试保存不可变脚本修订快照，不依赖脚本库后续的当前版本。
            snapshot.put("scriptSnapshot", sanitizeNode(objectMapper.valueToTree(scriptSnapshot)));
        }
        snapshot.put("runnerType", runner);
        execution.setRequestSnapshotJson(writeJson(snapshot, "执行快照序列化失败"));
        mapper.insertExecution(execution);
        if (execution.getId() == null) throw new BusinessException(500, "创建执行记录失败");

        // A fresh task starts a new result lifecycle. Never carry an earlier
        // PASS/FAIL/BLOCKED/SKIPPED into this pending attempt's cycle totals.
        // The previous result remains auditable in dpm_test_execution.
        if (mapper.resetCycleCaseForNewExecution(cycleCaseId) != 1) {
            throw conflict("新执行任务已创建，但轮次用例状态未能重置，事务已回滚");
        }
        insertEvent(execution.getId(), "TASK_CREATED", "task-created-" + taskId,
                "执行任务已创建，等待执行", null, request.getRequestedBy());
    }

    private ExecutionTaskInsertDTO newTask(Long cycleId, Long cycleCaseId, Long parentTaskId,
            String taskType, String idempotencyKey, ExecutionTaskCreateRequest request) {
        ExecutionTaskInsertDTO task = new ExecutionTaskInsertDTO();
        task.setCycleId(cycleId);
        task.setCycleCaseId(cycleCaseId);
        task.setParentTaskId(parentTaskId);
        task.setTaskNo("DPM-ET-" + System.currentTimeMillis() + "-"
                + UUID.randomUUID().toString().replace("-", "").substring(0, 8));
        task.setIdempotencyKey(idempotencyKey);
        task.setTaskType(taskType);
        task.setTaskStatus("PENDING");
        task.setRequestedBy(request.getRequestedBy());
        Map<String, Object> payload = new LinkedHashMap<String, Object>();
        payload.put("triggerSource", request.getTriggerSource());
        payload.put("requestedBy", request.getRequestedBy());
        payload.put("taskType", taskType);
        payload.put("cycleCaseId", cycleCaseId);
        task.setRequestPayloadJson(writeJson(payload, "执行任务请求快照序列化失败"));
        return task;
    }

    public Map<String, Object> get(Long id) {
        Map<String, Object> task = mapper.selectTask(id);
        if (task == null) throw notFound("执行任务不存在");
        Map<String, Object> result = new LinkedHashMap<String, Object>();
        result.put("task", task);
        if ("EXECUTE_CYCLE".equals(task.get("taskType"))) {
            List<Map<String, Object>> children = mapper.selectChildTasks(id);
            for (Map<String, Object> child : children) {
                child.put("executions", executions(numberValue(child.get("id"))));
            }
            result.put("children", children);
        } else {
            result.put("executions", executions(id));
        }
        return result;
    }

    private List<Map<String, Object>> executions(Long taskId) {
        List<Map<String, Object>> executions = mapper.selectExecutions(taskId);
        for (Map<String, Object> execution : executions) {
            Long executionId = numberValue(execution.get("id"));
            execution.put("events", mapper.selectEvents(executionId));
            execution.put("attachments", mapper.selectAttachments(executionId));
        }
        return executions;
    }

    @Transactional
    public Map<String, Object> start(Long taskId, Long executionId, ExecutionTaskStartRequest request) {
        // 开始执行必须先锁轮次，再锁父/子任务；与轮次终止保持相同的锁顺序。
        Map<String, Object> cycle = lockCycleForTask(taskId);
        validateRunnableCycle(cycle);
        lockParentBeforeChild(taskId);
        Map<String, Object> task = mapper.selectTaskForUpdate(taskId);
        if (task == null) throw notFound("执行任务不存在");
        if (!"EXECUTE_CASE".equals(task.get("taskType"))) {
            throw badRequest("整轮父任务不能直接开始，必须执行其中的用例子任务");
        }
        if (!"PENDING".equals(task.get("taskStatus"))) throw conflict("当前任务状态不允许开始执行");
        Map<String, Object> execution = mapper.selectExecutionForUpdate(taskId, executionId);
        if (execution == null) throw notFound("执行记录不属于当前任务");
        if (!"QUEUED".equals(execution.get("executionStatus"))) throw conflict("当前执行记录不是待执行状态");

        String runner = upper(stringValue(execution.get("runnerType")));
        String actor = upper(request.getActor());
        if (Arrays.asList("HTTP", "NODE", "BROWSER").contains(runner)) {
            throw new BusinessException(HttpStatus.CONFLICT.value(),
                    runner + " 类型固定脚本由独立 Runner 自动领取，不能通过人工开始接口启动");
        }
        if (!"MANUAL".equals(runner) && !"CHATGPT".equals(runner)) {
            throw new BusinessException(HttpStatus.CONFLICT.value(),
                    "当前固定脚本执行器尚未部署，暂不能启动 " + runner + " 类型任务");
        }
        if (!runner.equals(actor)) throw badRequest("执行人类型与用例配置的执行方式不匹配");
        Map<String, Object> taskDetail = mapper.selectTask(taskId);
        if ("PROD".equals(upper(stringValue(taskDetail.get("environmentType"))))
                && !"MANUAL".equals(runner)) {
            throw new BusinessException(HttpStatus.FORBIDDEN.value(), "生产环境当前仅允许人工执行");
        }
        String executor = sanitizeText(trim(request.getExecutorName()));
        if (executor == null) executor = actor;
        if (executor.length() > 64) throw badRequest("执行人标识长度不能超过 64 个字符");
        if (mapper.updateTaskStarted(taskId, executor) != 1
                || mapper.updateExecutionStarted(executionId, executor) != 1) {
            throw conflict("执行任务状态已变化，请刷新后重试");
        }
        requireCycleCaseUpdate(numberValue(task.get("cycleCaseId")), "RUNNING", null);
        insertEvent(executionId, "EXECUTION_STARTED", "execution-started-" + executionId,
                "执行开始：" + actor, null, executor);
        refreshParent(taskId);
        return get(taskId);
    }

    @Transactional
    public Map<String, Object> addEvent(Long taskId, Long executionId, ExecutionEventRequest request) {
        lockParentBeforeChild(taskId);
        Map<String, Object> task = mapper.selectTaskForUpdate(taskId);
        if (task == null) throw notFound("执行任务不存在");
        if (!"RUNNING".equals(task.get("taskStatus"))) throw conflict("当前任务未处于执行中，不能追加执行事件");
        Map<String, Object> execution = mapper.selectExecutionForUpdate(taskId, executionId);
        if (execution == null) throw notFound("执行记录不属于当前任务");
        if (!"RUNNING".equals(execution.get("executionStatus"))) throw conflict("当前执行记录未处于执行中");

        String type = upper(request.getEventType());
        if (!EVENT_TYPES.contains(type)) throw badRequest("执行事件类型不合法");
        String dataJson = sanitizeJson(request.getEventDataJson());
        String content = sanitizeText(trim(request.getEventContent()));
        ExecutionEventInsertDTO event = event(executionId, type, request.getEventKey(),
                content, dataJson, request.getCreatedBy());
        int inserted = mapper.insertEvent(event);
        if (inserted == 0) return get(taskId);

        if ("CHECKPOINT".equals(type)) {
            if (!StringUtils.hasText(dataJson)) throw badRequest("检查点事件必须提供合法 JSON 数据");
            if (mapper.updateExecutionCheckpoint(executionId, dataJson) != 1
                    || mapper.updateTaskHeartbeat(taskId) != 1) {
                throw conflict("执行状态已变化，检查点未保存");
            }
        } else if ("WAITING_HUMAN".equals(type)) {
            if (mapper.updateExecutionWaitingHuman(executionId, content) != 1
                    || mapper.updateTaskWaitingHuman(taskId) != 1) {
                throw conflict("任务状态已变化，无法转入人工介入");
            }
            requireCycleCaseUpdate(numberValue(task.get("cycleCaseId")), "WAITING_HUMAN", null);
        } else {
            mapper.updateTaskHeartbeat(taskId);
        }
        refreshParent(taskId);
        return get(taskId);
    }

    @Transactional
    public Map<String, Object> complete(Long taskId, Long executionId, ExecutionCompleteRequest request) {
        lockParentBeforeChild(taskId);
        Map<String, Object> task = mapper.selectTaskForUpdate(taskId);
        if (task == null) throw notFound("执行任务不存在");
        if (!"RUNNING".equals(task.get("taskStatus"))) throw conflict("当前任务未处于执行中，不能登记结果");
        Map<String, Object> execution = mapper.selectExecutionForUpdate(taskId, executionId);
        if (execution == null) throw notFound("执行记录不属于当前任务");
        if (!"RUNNING".equals(execution.get("executionStatus"))) throw conflict("当前执行记录未处于执行中");

        String result = upper(request.getResult());
        if (!RESULTS.contains(result)) throw badRequest("测试执行结果不合法");
        String actual = sanitizeText(trim(request.getActualResult()));
        String log = sanitizeText(trim(request.getLogExcerpt()));
        if (log != null && log.length() > 20000) log = log.substring(0, 20000);
        String error = sanitizeText(trim(request.getErrorMessage()));
        if (mapper.updateExecutionCompleted(executionId, result, actual, log, error) != 1
                || mapper.updateTaskCompleted(taskId) != 1) {
            throw conflict("执行记录状态已变化，结果未写入");
        }
        requireCycleCaseUpdate(numberValue(task.get("cycleCaseId")), "COMPLETED", result);
        refreshCycleIfComplete(taskId);
        insertEvent(executionId, "EXECUTION_COMPLETED", "execution-completed-" + executionId,
                "执行完成，结果：" + result, null, request.getExecutorName());
        refreshParent(taskId);
        return get(taskId);
    }

    @Transactional
    public Map<String, Object> humanIntervention(Long taskId, HumanInterventionRequest request) {
        lockParentBeforeChild(taskId);
        Map<String, Object> task = mapper.selectTaskForUpdate(taskId);
        if (task == null) throw notFound("执行任务不存在");
        if (!"WAITING_HUMAN".equals(task.get("taskStatus"))) throw conflict("当前任务不在等待人工介入状态");
        Map<String, Object> execution = mapper.selectLatestExecutionForUpdate(taskId);
        if (execution == null || !"WAITING_HUMAN".equals(execution.get("executionStatus"))) {
            throw conflict("当前执行记录不在等待人工介入状态");
        }
        String decision = upper(request.getDecision());
        String note = sanitizeText(trim(request.getNote()));
        String actor = trim(request.getDecidedBy());
        if ("CONFIRMED".equals(decision)) {
            if (mapper.updateExecutionHumanConfirmed(numberValue(execution.get("id")), note) != 1
                    || mapper.updateTaskPending(taskId) != 1) {
                throw conflict("人工介入状态已变化，请刷新后重试");
            }
            requireCycleCaseUpdate(numberValue(task.get("cycleCaseId")), "PENDING", null);
            insertEvent(numberValue(execution.get("id")), "HUMAN_CONFIRMED",
                    "human-confirmed-" + execution.get("id"), note, null, actor);
        } else if ("REJECTED".equals(decision)) {
            if (mapper.updateExecutionHumanRejected(numberValue(execution.get("id")), note) != 1
                    || mapper.updateTaskCompleted(taskId) != 1) {
                throw conflict("人工介入状态已变化，请刷新后重试");
            }
            requireCycleCaseUpdate(numberValue(task.get("cycleCaseId")), "COMPLETED", "BLOCKED");
            refreshCycleIfComplete(taskId);
            insertEvent(numberValue(execution.get("id")), "HUMAN_REJECTED",
                    "human-rejected-" + execution.get("id"), note, null, actor);
        } else {
            throw badRequest("人工介入决定仅支持 CONFIRMED 或 REJECTED");
        }
        refreshParent(taskId);
        return get(taskId);
    }

    /**
     * 轮次终止时取消该轮次下所有仍活动的根任务（整轮父任务或单用例任务）。
     * 调用方应先锁定并将轮次状态更新为 ABORTED；此处再次锁定轮次，确保调用顺序一致。
     */
    @Transactional
    public int cancelActiveTasksForAbortedCycle(Long cycleId, String note, String cancelledBy) {
        Map<String, Object> cycle = mapper.selectCycleForUpdate(cycleId);
        if (cycle == null) throw notFound("测试轮次不存在");
        if (!"ABORTED".equals(cycle.get("status"))) {
            throw conflict("只有已终止的测试轮次才能批量取消执行任务");
        }

        String safeNote = sanitizeText(trim(note));
        List<Long> taskIds = mapper.selectActiveCycleRootTaskIds(cycleId);
        int cancelled = 0;
        for (Long taskId : taskIds) {
            if (taskId == null) continue;
            lockParentBeforeChild(taskId);
            Map<String, Object> task = mapper.selectTaskForUpdate(taskId);
            if (task == null || !ACTIVE_TASK_STATUSES.contains(stringValue(task.get("taskStatus")))) {
                continue;
            }
            cancelLockedTask(task, safeNote, cancelledBy);
            cancelled++;
        }
        return cancelled;
    }

    @Transactional
    public Map<String, Object> cancel(Long taskId, String note, String cancelledBy) {
        lockParentBeforeChild(taskId);
        Map<String, Object> task = mapper.selectTaskForUpdate(taskId);
        if (task == null) throw notFound("执行任务不存在");
        String status = stringValue(task.get("taskStatus"));
        if (!ACTIVE_TASK_STATUSES.contains(status)) throw conflict("当前任务状态不允许取消");

        cancelLockedTask(task, sanitizeText(trim(note)), cancelledBy);
        refreshCycleIfComplete(taskId);
        return get(taskId);
    }

    private void cancelLockedTask(Map<String, Object> task, String note, String actor) {
        Long taskId = numberValue(task.get("id"));
        if ("EXECUTE_CYCLE".equals(task.get("taskType"))) {
            List<Map<String, Object>> children = mapper.selectChildTasksForUpdate(taskId);
            for (Map<String, Object> child : children) cancelCaseTask(child, note, actor);
            if (mapper.updateTaskCancelled(taskId) != 1) throw conflict("任务状态已变化，取消失败");
        } else {
            cancelCaseTask(task, note, actor);
        }
        Long parentId = numberValue(task.get("parentTaskId"));
        if (parentId != null) refreshParent(taskId);
    }

    private void cancelCaseTask(Map<String, Object> task, String note, String actor) {
        String status = stringValue(task.get("taskStatus"));
        if (!ACTIVE_TASK_STATUSES.contains(status)) return;
        Long taskId = numberValue(task.get("id"));
        Map<String, Object> execution = mapper.selectLatestExecutionForUpdate(taskId);
        if (execution != null) {
            Long executionId = numberValue(execution.get("id"));
            if (mapper.updateExecutionCancelled(executionId, note == null ? "任务已取消" : note) != 1) {
                throw conflict("执行记录状态已变化，取消失败");
            }
            insertEvent(executionId, "EXECUTION_CANCELLED",
                    "execution-cancelled-" + executionId,
                    note == null ? "任务已取消" : note, null, actor);
        }
        if (mapper.updateTaskCancelled(taskId) != 1) {
            throw conflict("执行任务状态已变化，取消失败");
        }
        Long cycleCaseId = numberValue(task.get("cycleCaseId"));
        if (cycleCaseId != null) requireCycleCaseUpdate(cycleCaseId, "CANCELLED", null);
    }

    @Transactional
    public Map<String, Object> resume(Long taskId, String requestedBy) {
        lockParentBeforeChild(taskId);
        Map<String, Object> task = mapper.selectTaskForUpdate(taskId);
        if (task == null) throw notFound("执行任务不存在");
        if (!"EXECUTE_CASE".equals(task.get("taskType"))) throw badRequest("整轮父任务不能直接恢复");
        if (!"RECOVERY_REQUIRED".equals(task.get("taskStatus"))) {
            throw conflict("只有需要恢复的任务才能继续执行");
        }
        Map<String, Object> previous = mapper.selectLatestExecutionForUpdate(taskId);
        if (previous == null || !"INTERRUPTED".equals(previous.get("executionStatus"))) {
            throw conflict("没有可恢复的中断执行记录");
        }
        if (mapper.updateTaskResumed(taskId) != 1) throw conflict("任务状态已变化，请刷新后重试");

        ExecutionInsertDTO next = new ExecutionInsertDTO();
        Long cycleCaseId = numberValue(previous.get("cycleCaseId"));
        next.setCycleCaseId(cycleCaseId);
        next.setTaskId(taskId);
        next.setAttemptNo(mapper.selectNextAttemptNo(cycleCaseId));
        next.setExecutionMode(stringValue(previous.get("executionMode")));
        next.setRunnerType(stringValue(previous.get("runnerType")));
        next.setTriggerSource(stringValue(previous.get("triggerSource")));
        next.setExecutionStatus("QUEUED");
        next.setExpectedResultSnapshot(stringValue(previous.get("expectedResultSnapshot")));
        next.setRequestSnapshotJson(stringValue(previous.get("requestSnapshotJson")));
        // 新 attempt 继承最近一次检查点，ChatGPT 可以从中断位置继续，而不是从头重放。
        next.setCheckpointJson(stringValue(previous.get("checkpointJson")));
        mapper.insertExecution(next);
        if (next.getId() == null) throw new BusinessException(500, "创建恢复执行记录失败");
        requireCycleCaseUpdate(cycleCaseId, "PENDING", null);
        insertEvent(next.getId(), "EXECUTION_RESUMED",
                "execution-resumed-" + next.getId(), "基于检查点恢复；上一次执行记录：" + previous.get("id"),
                stringValue(previous.get("checkpointJson")), requestedBy);
        refreshParent(taskId);
        return get(taskId);
    }

    @Transactional
    public int recoverStaleTasks() {
        List<Map<String, Object>> stale = mapper.selectStaleTasks();
        int recovered = 0;
        for (Map<String, Object> candidate : stale) {
            Long taskId = numberValue(candidate.get("id"));
            lockParentBeforeChild(taskId);
            Map<String, Object> task = mapper.selectTaskForUpdate(taskId);
            if (task == null || !"RUNNING".equals(task.get("taskStatus"))) continue;
            Map<String, Object> execution = mapper.selectLatestExecutionForUpdate(taskId);
            if (execution == null || !"RUNNING".equals(execution.get("executionStatus"))) continue;
            String note = "执行心跳超过 5 分钟未更新，任务已暂停，等待人工确认恢复";
            // 先通过带心跳时间条件的 UPDATE 原子抢占过期任务。
            // 若 Runner 在扫描期间刷新了心跳，UPDATE 返回 0，不能中断当前执行记录。
            if (mapper.updateTaskRecoveryRequired(taskId, note) != 1) continue;

            // 任务状态已成功切换后，再中断对应 attempt。该更新失败必须抛异常，
            // 让本方法的事务回滚前面的任务状态更新，避免出现任务与执行记录不一致。
            if (mapper.updateExecutionInterrupted(numberValue(execution.get("id")), note) != 1) {
                throw conflict("任务已标记待恢复，但执行记录状态更新失败，事务已回滚");
            }
            requireCycleCaseUpdate(numberValue(task.get("cycleCaseId")), "RECOVERY_REQUIRED", null);
            insertEvent(numberValue(execution.get("id")), "EXECUTION_INTERRUPTED",
                    "execution-interrupted-" + execution.get("id"), note, null, "system");
            refreshParent(taskId);
            recovered++;
        }
        return recovered;
    }

    /**
     * 所有执行任务状态变更统一按「轮次 -> 父任务 -> 子任务」加锁，
     * 避免轮次完成判断和父任务聚合在并发执行时发生竞态。
     */
    private void lockParentBeforeChild(Long taskId) {
        // 所有执行状态变更统一先锁轮次，避免并发完成不同用例时产生锁顺序反转。
        Long cycleId = mapper.selectCycleIdByTaskId(taskId);
        if (cycleId == null || mapper.selectCycleForUpdate(cycleId) == null) {
            throw notFound("执行任务关联的测试轮次不存在");
        }
        Long parentId = mapper.selectParentTaskId(taskId);
        if (parentId != null && mapper.selectTaskForUpdate(parentId) == null) {
            throw conflict("执行任务的父任务不存在，无法安全更新状态");
        }
    }

    /**
     * Cycle case must change in the same transaction as task/execution state.
     * A missing/unchanged row indicates an unexpected lifecycle mismatch;
     * never commit a completed task with a stale cycle result.
     */
    private void requireCycleCaseUpdate(Long cycleCaseId, String status, String result) {
        if (cycleCaseId == null || mapper.updateCycleCase(cycleCaseId, status, result) != 1) {
            throw conflict("轮次用例状态同步失败，执行任务状态更新已回滚");
        }
    }

    private void refreshCycleIfComplete(Long taskId) {
        Long cycleId = mapper.selectCycleIdByTaskId(taskId);
        if (cycleId != null) {
            mapper.completeCycleIfAllCasesTerminal(cycleId);
        }
    }

    private void refreshParent(Long taskId) {
        Long parentId = mapper.selectParentTaskId(taskId);
        if (parentId == null) return;
        List<Map<String, Object>> children = mapper.selectChildTasksForUpdate(parentId);
        boolean running = false, recovery = false, waiting = false, pending = false;
        boolean failed = false, cancelled = false;
        for (Map<String, Object> child : children) {
            String status = stringValue(child.get("taskStatus"));
            running |= "RUNNING".equals(status);
            recovery |= "RECOVERY_REQUIRED".equals(status);
            waiting |= "WAITING_HUMAN".equals(status);
            pending |= "PENDING".equals(status);
            failed |= "FAILED".equals(status);
            cancelled |= "CANCELLED".equals(status);
        }
        String aggregate;
        if (running) aggregate = "RUNNING";
        else if (recovery) aggregate = "RECOVERY_REQUIRED";
        else if (waiting) aggregate = "WAITING_HUMAN";
        else if (pending) aggregate = "PENDING";
        else if (failed) aggregate = "FAILED";
        else if (cancelled) aggregate = "CANCELLED";
        else aggregate = "COMPLETED";
        mapper.updateTaskAggregate(parentId, aggregate);
    }

    private Map<String, Object> lockCycleForTask(Long taskId) {
        Long cycleId = mapper.selectCycleIdByTaskId(taskId);
        if (cycleId == null) throw notFound("执行任务不存在或未关联测试轮次");
        Map<String, Object> cycle = mapper.selectCycleForUpdate(cycleId);
        if (cycle == null) throw notFound("测试轮次不存在");
        return cycle;
    }

    private void validateRunnableCycle(Map<String, Object> cycle) {
        if (cycle == null) throw notFound("测试轮次不存在");
        if (!"RUNNING".equals(cycle.get("status"))) {
            throw conflict("测试轮次已终止或未开始，不允许执行任务");
        }
    }

    private void validateEnvironmentMode(Map<String, Object> cycle, List<Map<String, Object>> cases) {
        if (!"PROD".equals(upper(stringValue(cycle.get("environmentType"))))) return;
        for (Map<String, Object> item : cases) {
            if (!"MANUAL".equals(upper(stringValue(item.get("executionMode"))))) {
                throw new BusinessException(HttpStatus.FORBIDDEN.value(),
                        "生产环境当前仅允许人工执行，不能创建 ChatGPT 或固定脚本自动执行任务");
            }
        }
    }

    private String resolveRunnerType(String mode, String scriptLanguage) {
        if ("MANUAL".equals(mode)) return "MANUAL";
        if ("AI".equals(mode)) return "CHATGPT";
        if ("SCRIPT".equals(mode)) {
            String language = upper(scriptLanguage);
            if (Arrays.asList("NODE", "PYTHON", "JAVA", "HTTP", "BROWSER").contains(language)) return language;
            throw badRequest("固定脚本未绑定有效的脚本修订版本或脚本语言");
        }
        throw badRequest("测试用例执行方式不合法");
    }

    private void normalizeCreateRequest(ExecutionTaskCreateRequest request) {
        if (request == null) throw badRequest("执行任务请求不能为空");
        String key = trim(request.getIdempotencyKey());
        if (key == null) throw badRequest("必须提供 Idempotency-Key，避免网络重试重复创建任务");
        // Header 会在 Controller 的 Bean Validation 之后覆盖 body 字段，因此必须在服务层再次校验长度。
        if (key.length() > 64) throw badRequest("Idempotency-Key 长度不能超过 64 个字符");
        request.setIdempotencyKey(key);
        String requestedBy = sanitizeText(trim(request.getRequestedBy()));
        if (requestedBy == null) requestedBy = "local-user";
        if (requestedBy.length() > 64) throw badRequest("发起人标识长度不能超过 64 个字符");
        request.setRequestedBy(requestedBy);
        String trigger = upper(request.getTriggerSource());
        if (trigger == null) trigger = "USER";
        if (!Arrays.asList("USER", "CHATGPT", "SYSTEM").contains(trigger)) {
            throw badRequest("执行任务触发来源不合法");
        }
        request.setTriggerSource(trigger);
    }

    private void insertEvent(Long executionId, String type, String key,
            String content, String dataJson, String createdBy) {
        mapper.insertEvent(event(executionId, type, key,
                sanitizeText(content), sanitizeJson(dataJson), createdBy));
    }

    private ExecutionEventInsertDTO event(Long executionId, String type, String key,
            String content, String dataJson, String createdBy) {
        ExecutionEventInsertDTO event = new ExecutionEventInsertDTO();
        event.setExecutionId(executionId);
        event.setEventType(type);
        event.setEventKey(sanitizeText(trim(key)));
        event.setEventContent(sanitizeText(content));
        event.setEventDataJson(sanitizeJson(dataJson));
        event.setCreatedBy(sanitizeText(trim(createdBy)));
        return event;
    }

    private String sanitizeJson(String json) {
        if (!StringUtils.hasText(json)) return null;
        try {
            JsonNode source = objectMapper.readTree(json);
            return objectMapper.writeValueAsString(sanitizeNode(source));
        } catch (Exception exception) {
            throw badRequest("执行事件数据必须是合法 JSON");
        }
    }

    private JsonNode sanitizeNode(JsonNode source) {
        if (source.isObject()) {
            ObjectNode target = objectMapper.createObjectNode();
            Iterator<Map.Entry<String, JsonNode>> fields = source.fields();
            while (fields.hasNext()) {
                Map.Entry<String, JsonNode> field = fields.next();
                if (SENSITIVE_KEY.matcher(field.getKey()).find()) {
                    target.put(field.getKey(), "[REDACTED]");
                } else {
                    target.set(field.getKey(), sanitizeNode(field.getValue()));
                }
            }
            return target;
        }
        if (source.isTextual()) {
            // JSON 字符串字段也可能包含拼接后的请求头或日志，不能只按敏感字段名脱敏。
            return objectMapper.getNodeFactory().textNode(sanitizeText(source.asText()));
        }
        if (source.isArray()) {
            ArrayNode target = objectMapper.createArrayNode();
            for (JsonNode item : source) target.add(sanitizeNode(item));
            return target;
        }
        return source.deepCopy();
    }

    private String sanitizeText(String value) {
        if (value == null) return null;
        String trimmed = value.trim();
        // 环境配置等快照字段可能把一整段 JSON 再序列化为字符串，需要继续递归脱敏。
        if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
            try {
                JsonNode nested = objectMapper.readTree(trimmed);
                if (nested.isObject() || nested.isArray()) {
                    return objectMapper.writeValueAsString(sanitizeNode(nested));
                }
            } catch (Exception ignored) {
                // 普通日志文本可能以 { 或 [ 开头，不是 JSON 时继续使用文本规则脱敏。
            }
        }
        String safe = BEARER_VALUE.matcher(value).replaceAll("Bearer [REDACTED]");
        return SENSITIVE_ASSIGNMENT.matcher(safe).replaceAll("$1[REDACTED]");
    }

    private JsonNode parseJson(String json) {
        if (!StringUtils.hasText(json)) return null;
        try {
            return objectMapper.readTree(json);
        } catch (Exception exception) {
            throw new BusinessException(500, "执行快照 JSON 数据损坏");
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

    private String stringValue(Object value) {
        return value == null ? null : String.valueOf(value);
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

    private BusinessException conflict(String message) {
        return new BusinessException(HttpStatus.CONFLICT.value(), message);
    }
}
