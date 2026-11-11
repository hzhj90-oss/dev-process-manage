package com.devprocess.manager.execution.service;

import com.devprocess.manager.common.exception.BusinessException;
import com.devprocess.manager.execution.dto.ExecutionCompleteRequest;
import com.devprocess.manager.execution.dto.ExecutionEventInsertDTO;
import com.devprocess.manager.execution.dto.ExecutionEventRequest;
import com.devprocess.manager.execution.dto.RunnerClaimRequest;
import com.devprocess.manager.execution.dto.RunnerFailureRequest;
import com.devprocess.manager.execution.mapper.ExecutionTaskMapper;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Arrays;
import java.util.HashMap;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import java.util.regex.Pattern;

@Service
public class RunnerService {
    private static final List<String> RESULTS = Arrays.asList("PASS", "FAIL", "BLOCKED", "SKIPPED");
    private static final List<String> EVENT_TYPES = Arrays.asList(
            "STEP_STARTED", "STEP_COMPLETED", "ASSERTION_PASSED", "ASSERTION_FAILED",
            "LOG", "CHECKPOINT", "WAITING_HUMAN", "HEARTBEAT", "API_REQUEST", "API_RESPONSE", "NOTE");
    private static final Pattern SENSITIVE_KEY = Pattern.compile(
            "(?i)(password|passwd|token|authorization|cookie|secret|api[_-]?key|private[_-]?key|credential)");
    private static final Pattern SENSITIVE_ASSIGNMENT = Pattern.compile(
            "(?i)(\\b(?:password|passwd|(?:access|refresh|id)[_-]?token|token|authorization|cookie|secret|api[_-]?key|private[_-]?key|credential|client[_-]?secret)\\b\\s*[:=]\\s*)(\"[^\"]*\"|'[^']*'|[^\\s,;]+)");
    private static final Pattern BEARER_VALUE = Pattern.compile("(?i)Bearer\\s+[A-Za-z0-9._~+/-]+=*");

    private final ExecutionTaskMapper mapper;
    private final ObjectMapper objectMapper;
    @Value("${execution.runner.token:}")
    private String sharedToken;
    @Value("${execution.runner.lease-seconds:60}")
    private int configuredLeaseSeconds;

    public RunnerService(ExecutionTaskMapper mapper, ObjectMapper objectMapper) {
        this.mapper = mapper;
        this.objectMapper = objectMapper;
    }
    @Transactional
    public Map<String, Object> claim(String suppliedToken, RunnerClaimRequest request) {
        verifySharedToken(suppliedToken);
        if (request == null || !StringUtils.hasText(request.getRunnerId())) {
            throw badRequest("Runner 标识不能为空");
        }
        String runnerId = request.getRunnerId().trim();
        if (runnerId.length() > 64 || !runnerId.matches("[A-Za-z0-9._-]+")) {
            throw badRequest("Runner 标识格式不合法");
        }

        String runnerType = upper(request.getRunnerType());
        if (runnerType == null) runnerType = "HTTP";
        if (!Arrays.asList("HTTP", "NODE", "BROWSER").contains(runnerType)) {
            throw badRequest("当前只允许 HTTP 或 NODE Runner 领取任务");
        }
        // 每次领取只竞争一个候选，避免同一事务持有多个轮次锁时出现跨轮次锁顺序反转。
        List<Map<String, Object>> candidates = mapper.selectClaimableTasks(runnerType, 1);
        for (Map<String, Object> candidate : candidates) {
            Long taskId = numberValue(candidate.get("id"));
            if (taskId == null) continue;
            Long cycleId = mapper.selectCycleIdByTaskId(taskId);
            if (cycleId == null) continue;
            Map<String, Object> cycle = mapper.selectCycleForUpdate(cycleId);
            if (cycle == null || !"RUNNING".equals(cycle.get("status"))) continue;
            // 领取与轮次终止统一采用「轮次 -> 父任务 -> 子任务」的锁顺序。
            lockParentBeforeChild(taskId);
            Map<String, Object> lockedTask = mapper.selectTaskForUpdate(taskId);
            if (lockedTask == null || !"PENDING".equals(lockedTask.get("taskStatus"))) continue;
            Map<String, Object> execution = mapper.selectLatestExecutionForUpdate(taskId);
            if (execution == null || !"QUEUED".equals(execution.get("executionStatus"))
                    || !runnerType.equals(upper(stringValue(execution.get("runnerType"))))) continue;

            Map<String, Object> task = mapper.selectTask(taskId);
            if (task == null || "PROD".equals(upper(stringValue(task.get("environmentType"))))) continue;
            JsonNode snapshot = parseJson(stringValue(execution.get("requestSnapshotJson")));
            JsonNode script = snapshot == null ? null : snapshot.path("scriptSnapshot");
            if (script == null || script.isMissingNode()
                    || !runnerType.equals(upper(script.path("language").asText()))
                    || !"INLINE".equals(upper(script.path("sourceType").asText()))
                    || !script.path("sourceContent").isTextual()) continue;
            String leaseToken = UUID.randomUUID().toString().replace("-", "")
                    + UUID.randomUUID().toString().replace("-", "");
            String leaseHash = sha256(leaseToken);
            int leaseSeconds = leaseSeconds();
            if (mapper.updateTaskClaimed(taskId, runnerId, leaseHash, leaseSeconds) != 1) continue;
            Long executionId = numberValue(execution.get("id"));
            if (executionId == null || mapper.updateExecutionStarted(executionId, runnerId) != 1) {
                throw conflict("Runner 领取任务时执行记录状态发生变化");
            }
            Long cycleCaseId = numberValue(lockedTask.get("cycleCaseId"));
            if (cycleCaseId == null || mapper.updateCycleCase(cycleCaseId, "RUNNING", null) != 1) {
                throw conflict("Runner 领取任务时轮次用例状态更新失败");
            }
            Map<String, Object> eventData = new LinkedHashMap<String, Object>();
            eventData.put("runnerId", runnerId);
            eventData.put("leaseSeconds", leaseSeconds);
            insertEvent(executionId, "RUNNER_CLAIMED", "runner-claimed-" + executionId,
                    runnerType + " Runner 已领取任务", writeJson(eventData), runnerId);
            refreshParent(taskId);

            Map<String, Object> taskData = new LinkedHashMap<String, Object>();
            taskData.put("id", taskId);
            taskData.put("taskNo", task.get("taskNo"));
            taskData.put("cycleId", task.get("cycleId"));
            taskData.put("cycleCaseId", cycleCaseId);
            taskData.put("environmentCode", task.get("environmentCode"));
            taskData.put("environmentName", task.get("environmentName"));
            taskData.put("environmentType", task.get("environmentType"));
            taskData.put("codeVersion", task.get("codeVersion"));
            Map<String, Object> executionData = new LinkedHashMap<String, Object>();
            executionData.put("id", executionId);
            executionData.put("attemptNo", execution.get("attemptNo"));
            executionData.put("runnerType", runnerType);
            executionData.put("expectedResultSnapshot", execution.get("expectedResultSnapshot"));
            executionData.put("requestSnapshot", snapshot);
            Map<String, Object> response = new LinkedHashMap<String, Object>();
            response.put("claimed", true);
            response.put("runnerId", runnerId);
            response.put("leaseToken", leaseToken);
            response.put("leaseSeconds", leaseSeconds);
            response.put("task", taskData);
            response.put("execution", executionData);
            return response;
        }
        Map<String, Object> response = new LinkedHashMap<String, Object>();
        response.put("claimed", false);
        return response;
    }
    @Transactional
    public Map<String, Object> heartbeat(Long taskId, String runnerId, String leaseToken) {
        LeaseContext context = lockAndValidateLease(taskId, runnerId, leaseToken);
        renewLease(taskId, context.runnerId, context.leaseHash);
        Map<String, Object> response = new LinkedHashMap<String, Object>();
        response.put("ok", true);
        response.put("leaseSeconds", leaseSeconds());
        return response;
    }

    @Transactional
    public Map<String, Object> addEvent(Long taskId, String runnerId, String leaseToken,
            ExecutionEventRequest request) {
        LeaseContext context = lockAndValidateLease(taskId, runnerId, leaseToken);
        String type = upper(request.getEventType());
        if (!EVENT_TYPES.contains(type)) throw badRequest("Runner 执行事件类型不合法");
        String key = trim(request.getEventKey());
        if (key == null || key.length() > 64) throw badRequest("执行事件唯一键不能为空且不能超过 64 个字符");
        String content = sanitizeText(trim(request.getEventContent()));
        String data = sanitizeJson(request.getEventDataJson());
        if ("CHECKPOINT".equals(type) && data == null) {
            throw badRequest("检查点事件必须提供合法 JSON 数据");
        }
        renewLease(taskId, context.runnerId, context.leaseHash);
        ExecutionEventInsertDTO event = event(context.executionId, type, key, content, data, context.runnerId);
        if (mapper.insertEvent(event) == 0) return success();
        if ("CHECKPOINT".equals(type)
                && mapper.updateExecutionCheckpoint(context.executionId, data) != 1) {
            throw conflict("保存 Runner 检查点失败，执行状态可能已变化");
        }
        if ("WAITING_HUMAN".equals(type)) {
            if (mapper.updateExecutionWaitingHuman(context.executionId, content) != 1
                    || mapper.updateTaskWaitingHuman(taskId) != 1) {
                throw conflict("任务状态已变化，无法转入人工介入");
            }
            mapper.updateCycleCase(context.cycleCaseId, "WAITING_HUMAN", null);
            refreshParent(taskId);
        }
        return success();
    }

    @Transactional
    public Map<String, Object> complete(Long taskId, String runnerId, String leaseToken,
            ExecutionCompleteRequest request) {
        LeaseContext context = lockAndValidateLease(taskId, runnerId, leaseToken);
        String result = upper(request.getResult());
        if (!RESULTS.contains(result)) throw badRequest("Runner 执行结果不合法");
        renewLease(taskId, context.runnerId, context.leaseHash);
        String actual = sanitizeText(trim(request.getActualResult()));
        String log = sanitizeText(trim(request.getLogExcerpt()));
        if (log != null && log.length() > 20000) log = log.substring(0, 20000);
        String error = sanitizeText(trim(request.getErrorMessage()));
        if (mapper.updateExecutionCompleted(context.executionId, result, actual, log, error) != 1
                || mapper.updateTaskCompleted(taskId) != 1) {
            throw conflict("Runner 完成任务时状态已变化，结果未写入");
        }
        mapper.updateCycleCase(context.cycleCaseId, "COMPLETED", result);
        mapper.completeCycleIfAllCasesTerminal(context.cycleId);
        insertEvent(context.executionId, "EXECUTION_COMPLETED", "runner-completed-" + context.executionId,
                "Runner 执行完成，结果：" + result, null, context.runnerId);
        refreshParent(taskId);
        Map<String, Object> response = success();
        response.put("taskId", taskId);
        response.put("executionId", context.executionId);
        response.put("result", result);
        return response;
    }

    @Transactional
    public Map<String, Object> fail(Long taskId, String runnerId, String leaseToken,
            RunnerFailureRequest request) {
        LeaseContext context = lockAndValidateLease(taskId, runnerId, leaseToken);
        renewLease(taskId, context.runnerId, context.leaseHash);
        String error = sanitizeText(trim(request.getErrorMessage()));
        String log = sanitizeText(trim(request.getLogExcerpt()));
        if (log != null && log.length() > 20000) log = log.substring(0, 20000);
        if (mapper.updateExecutionCompleted(context.executionId, "BLOCKED", "Runner 执行引擎异常",
                log, error) != 1
                || mapper.updateTaskFailed(taskId, context.runnerId, context.leaseHash, error) != 1) {
            throw conflict("Runner 标记任务失败时状态已变化");
        }
        mapper.updateCycleCase(context.cycleCaseId, "COMPLETED", "BLOCKED");
        mapper.completeCycleIfAllCasesTerminal(context.cycleId);
        insertEvent(context.executionId, "RUNNER_FAILED", "runner-failed-" + context.executionId,
                "Runner 执行引擎失败", writeJson(java.util.Collections.singletonMap("error", error)),
                context.runnerId);
        refreshParent(taskId);
        Map<String, Object> response = success();
        response.put("taskId", taskId);
        response.put("executionId", context.executionId);
        response.put("taskStatus", "FAILED");
        return response;
    }

    private LeaseContext lockAndValidateLease(Long taskId, String runnerId, String leaseToken) {
        String id = trim(runnerId);
        if (id == null || id.length() > 64 || !id.matches("[A-Za-z0-9._-]+")) {
            throw badRequest("Runner 标识格式不合法");
        }
        String token = trim(leaseToken);
        if (token == null || token.length() < 32 || token.length() > 128) {
            throw new BusinessException(HttpStatus.UNAUTHORIZED.value(), "Runner 租约凭据无效");
        }
        Long cycleId = lockParentBeforeChild(taskId);
        Map<String, Object> task = mapper.selectTaskForUpdate(taskId);
        if (task == null) throw notFound("执行任务不存在");
        if (!"RUNNING".equals(task.get("taskStatus"))) throw conflict("任务已不处于执行中状态");
        Map<String, Object> execution = mapper.selectLatestExecutionForUpdate(taskId);
        if (execution == null || !"RUNNING".equals(execution.get("executionStatus"))
                || !Arrays.asList("HTTP", "NODE", "BROWSER").contains(upper(stringValue(execution.get("runnerType"))))) {
            throw conflict("当前执行记录不属于运行中的固定脚本 Runner");
        }
        Long executionId = numberValue(execution.get("id"));
        Long cycleCaseId = numberValue(task.get("cycleCaseId"));
        if (executionId == null || cycleCaseId == null) throw conflict("执行任务关联数据不完整");
        return new LeaseContext(id, sha256(token), executionId, cycleCaseId, cycleId);
    }

    private void renewLease(Long taskId, String runnerId, String leaseHash) {
        if (mapper.updateTaskLeaseHeartbeat(taskId, runnerId, leaseHash, leaseSeconds()) != 1) {
            throw new BusinessException(HttpStatus.CONFLICT.value(), "Runner 租约已过期或凭据不匹配");
        }
    }

    private void verifySharedToken(String suppliedToken) {
        if (!StringUtils.hasText(sharedToken)) {
            throw new BusinessException(HttpStatus.SERVICE_UNAVAILABLE.value(), "Runner 尚未配置共享认证密钥");
        }
        byte[] expected = sharedToken.trim().getBytes(StandardCharsets.UTF_8);
        byte[] supplied = (suppliedToken == null ? "" : suppliedToken.trim()).getBytes(StandardCharsets.UTF_8);
        if (!MessageDigest.isEqual(expected, supplied)) {
            throw new BusinessException(HttpStatus.UNAUTHORIZED.value(), "Runner 身份验证失败");
        }
    }
    private String sha256(String value) {
        try {
            byte[] bytes = MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8));
            StringBuilder result = new StringBuilder();
            for (byte item : bytes) result.append(String.format(Locale.ROOT, "%02x", item & 0xff));
            return result.toString();
        } catch (Exception exception) {
            throw new BusinessException(500, "生成 Runner 租约摘要失败");
        }
    }

    private int leaseSeconds() { return Math.max(30, Math.min(configuredLeaseSeconds, 300)); }

    private Long lockParentBeforeChild(Long taskId) {
        // 所有 Runner 请求都先锁轮次，防止最后两个用例并发完成时轮次统计发生竞态。
        Long cycleId = mapper.selectCycleIdByTaskId(taskId);
        Map<String, Object> cycle = cycleId == null ? null : mapper.selectCycleForUpdate(cycleId);
        if (cycle == null) {
            throw notFound("执行任务关联的测试轮次不存在");
        }
        if (!"RUNNING".equals(cycle.get("status"))) {
            throw conflict("测试轮次已结束，Runner 不再接受执行请求");
        }
        Long parentId = mapper.selectParentTaskId(taskId);
        if (parentId != null && mapper.selectTaskForUpdate(parentId) == null) {
            throw conflict("执行任务的父任务不存在，无法安全更新状态");
        }
        return cycleId;
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
        String aggregate = running ? "RUNNING" : recovery ? "RECOVERY_REQUIRED"
                : waiting ? "WAITING_HUMAN" : pending ? "PENDING"
                : failed ? "FAILED" : cancelled ? "CANCELLED" : "COMPLETED";
        mapper.updateTaskAggregate(parentId, aggregate);
    }

    private void insertEvent(Long executionId, String type, String key,
            String content, String dataJson, String createdBy) {
        mapper.insertEvent(event(executionId, type, key, content, dataJson, createdBy));
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
        try { return objectMapper.writeValueAsString(sanitizeNode(objectMapper.readTree(json))); }
        catch (Exception exception) { throw badRequest("Runner 事件数据必须是合法 JSON"); }
    }

    private JsonNode sanitizeNode(JsonNode source) {
        if (source.isObject()) {
            ObjectNode target = objectMapper.createObjectNode();
            Iterator<Map.Entry<String, JsonNode>> fields = source.fields();
            while (fields.hasNext()) {
                Map.Entry<String, JsonNode> field = fields.next();
                target.set(field.getKey(), SENSITIVE_KEY.matcher(field.getKey()).find()
                        ? objectMapper.getNodeFactory().textNode("[REDACTED]") : sanitizeNode(field.getValue()));
            }
            return target;
        }
        if (source.isArray()) {
            ArrayNode target = objectMapper.createArrayNode();
            for (JsonNode item : source) target.add(sanitizeNode(item));
            return target;
        }
        if (source.isTextual()) return objectMapper.getNodeFactory().textNode(sanitizeText(source.asText()));
        return source.deepCopy();
    }

    private String sanitizeText(String value) {
        if (value == null) return null;
        String text = value.trim();
        if (text.startsWith("{") || text.startsWith("[")) {
            try {
                JsonNode nested = objectMapper.readTree(text);
                if (nested.isObject() || nested.isArray()) return objectMapper.writeValueAsString(sanitizeNode(nested));
            } catch (Exception ignored) { }
        }
        String safe = BEARER_VALUE.matcher(value).replaceAll("Bearer [REDACTED]");
        return SENSITIVE_ASSIGNMENT.matcher(safe).replaceAll("$1[REDACTED]");
    }

    private JsonNode parseJson(String json) {
        if (!StringUtils.hasText(json)) return null;
        try { return objectMapper.readTree(json); }
        catch (Exception exception) { throw new BusinessException(500, "Runner 执行快照 JSON 损坏"); }
    }

    private String writeJson(Object value) {
        try { return objectMapper.writeValueAsString(value); }
        catch (Exception exception) { throw new BusinessException(500, "Runner 事件数据序列化失败"); }
    }
    private Map<String, Object> success() {
        Map<String, Object> result = new LinkedHashMap<String, Object>();
        result.put("ok", true);
        return result;
    }

    private Long numberValue(Object value) {
        if (value instanceof Number) return ((Number) value).longValue();
        if (value != null) {
            try { return Long.valueOf(String.valueOf(value)); }
            catch (NumberFormatException ignored) { }
        }
        return null;
    }

    private String stringValue(Object value) { return value == null ? null : String.valueOf(value); }
    private String upper(String value) { return StringUtils.hasText(value) ? value.trim().toUpperCase(Locale.ROOT) : null; }
    private String trim(String value) { return StringUtils.hasText(value) ? value.trim() : null; }

    private BusinessException badRequest(String message) {
        return new BusinessException(HttpStatus.BAD_REQUEST.value(), message);
    }
    private BusinessException notFound(String message) {
        return new BusinessException(HttpStatus.NOT_FOUND.value(), message);
    }

    private BusinessException conflict(String message) {
        return new BusinessException(HttpStatus.CONFLICT.value(), message);
    }

    private static class LeaseContext {
        private final String runnerId;
        private final String leaseHash;
        private final Long executionId;
        private final Long cycleCaseId;
        private final Long cycleId;
        private LeaseContext(String runnerId, String leaseHash, Long executionId,
                Long cycleCaseId, Long cycleId) {
            this.runnerId = runnerId;
            this.leaseHash = leaseHash;
            this.executionId = executionId;
            this.cycleCaseId = cycleCaseId;
            this.cycleId = cycleId;
        }
    }
}
