package com.devprocess.manager.testscript.service;

import com.devprocess.manager.common.exception.BusinessException;
import com.devprocess.manager.common.web.PageResult;
import com.devprocess.manager.testscript.dto.*;
import com.devprocess.manager.testscript.mapper.TestScriptMapper;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.regex.Pattern;

@Service
public class TestScriptService {
    private static final List<String> LANGUAGES = Arrays.asList("NODE", "PYTHON", "JAVA", "HTTP", "BROWSER");
    private static final List<String> SOURCE_TYPES = Arrays.asList("INLINE", "FILE");
    private static final Pattern SENSITIVE_HTTP_FIELD = Pattern.compile(
            "(?i)(password|passwd|token|authorization|cookie|secret|api[_-]?key|private[_-]?key|credential)");

    private final TestScriptMapper mapper;
    private final ObjectMapper objectMapper;

    public TestScriptService(TestScriptMapper mapper, ObjectMapper objectMapper) {
        this.mapper = mapper;
        this.objectMapper = objectMapper;
    }

    public PageResult<TestScriptSummaryDTO> page(String keyword, String language,
            Boolean enabled, int pageNum, int pageSize) {
        int page = Math.max(pageNum, 1);
        int size = Math.min(Math.max(pageSize, 1), 100);
        String key = trim(keyword);
        String lang = upper(language);
        if (lang != null && !LANGUAGES.contains(lang)) {
            throw badRequest("脚本语言筛选条件不合法");
        }
        List<TestScriptSummaryDTO> rows = mapper.selectPage(
                key, lang, enabled, (page - 1) * size, size);
        long total = mapper.countPage(key, lang, enabled);
        return new PageResult<TestScriptSummaryDTO>(rows, total, page, size);
    }

    public TestScriptDTO get(Long id) {
        TestScriptDTO script = mapper.selectById(id);
        if (script == null) throw notFound("脚本不存在");
        return script;
    }

    @Transactional
    public TestScriptDTO create(ScriptSaveRequest request) {
        normalize(request);
        if (request.getEnabled() == null) request.setEnabled(Boolean.TRUE);
        ensureUnique(request.getScriptCode(), null);
        mapper.insertMain(request);
        Long scriptId = request.getId();
        if (scriptId == null) throw new BusinessException(500, "创建脚本失败：未返回主键");
        ScriptRevisionInsert revision = toRevision(request, scriptId, 1);
        mapper.insertRevision(revision);
        mapper.updateCurrentRevision(scriptId, 1, revision.getId());
        return get(scriptId);
    }

    @Transactional
    public TestScriptDTO update(Long id, ScriptSaveRequest request) {
        // Lock the script main record so concurrent edits receive sequential revisions.
        Map<String, Object> current = mapper.selectMainForUpdate(id);
        if (current == null) throw notFound("脚本不存在");
        normalize(request);
        if (!StringUtils.hasText(request.getChangeNote())) {
            throw badRequest("修改脚本时必须填写修订说明");
        }
        if (request.getEnabled() == null) {
            Object enabled = current.get("enabled");
            request.setEnabled(enabled == null || Boolean.TRUE.equals(enabled)
                    || (enabled instanceof Number && ((Number) enabled).intValue() == 1));
        }
        ensureUnique(request.getScriptCode(), id);
        Object revisionValue = current.get("revisionNo");
        int nextRevision = revisionValue instanceof Number
                ? ((Number) revisionValue).intValue() + 1 : 1;
        mapper.updateMain(id, request, nextRevision);
        ScriptRevisionInsert revision = toRevision(request, id, nextRevision);
        mapper.insertRevision(revision);
        mapper.updateCurrentRevision(id, nextRevision, revision.getId());
        return get(id);
    }

    @Transactional
    public void setEnabled(Long id, Boolean enabled) {
        if (mapper.selectMainForUpdate(id) == null) throw notFound("脚本不存在");
        mapper.updateEnabled(id, enabled);
    }

    public List<TestScriptRevisionDTO> revisions(Long id) {
        get(id);
        return mapper.selectRevisions(id);
    }

    public TestScriptRevisionDTO revision(Long id, Long revisionId) {
        get(id);
        TestScriptRevisionDTO revision = mapper.selectRevisionById(id, revisionId);
        if (revision == null) throw notFound("脚本修订版本不存在");
        return revision;
    }

    private void normalize(ScriptSaveRequest request) {
        request.setScriptCode(request.getScriptCode().trim());
        request.setScriptName(request.getScriptName().trim());
        request.setScriptLanguage(upper(request.getScriptLanguage()));
        request.setScriptVersion(request.getScriptVersion().trim());
        request.setSourceType(upper(request.getSourceType()));
        request.setEntryPoint(request.getEntryPoint().trim());
        request.setRuntimeVersion(trim(request.getRuntimeVersion()));
        request.setDescription(trim(request.getDescription()));
        request.setChangeNote(trim(request.getChangeNote()));
        request.setCreatedBy(trim(request.getCreatedBy()));

        if (!LANGUAGES.contains(request.getScriptLanguage())) throw badRequest("不支持的脚本语言");
        if (!SOURCE_TYPES.contains(request.getSourceType())) throw badRequest("脚本来源类型不合法");

        if ("INLINE".equals(request.getSourceType())) {
            if (!StringUtils.hasText(request.getSourceContent())) throw badRequest("内联脚本内容不能为空");
            if (request.getSourceContent().getBytes(StandardCharsets.UTF_8).length > 100 * 1024) {
                throw badRequest("脚本内容 UTF-8 编码后不能超过100KB");
            }
            request.setSourcePath(null);
        } else {
            try {
                // FILE is registry-only until a sandboxed runner is deployed.
                // Normalize here so unsafe Windows/URL-style paths cannot enter snapshots.
                request.setSourcePath(ScriptPathPolicy.normalizeRelativePath(request.getSourcePath()));
            } catch (IllegalArgumentException exception) {
                throw badRequest("脚本文件路径必须是安全的相对路径，禁止目录穿越、设备名和编码分隔符");
            }
            request.setSourceContent(null);
        }

        if ("HTTP".equals(request.getScriptLanguage())) {
            if (!"INLINE".equals(request.getSourceType())) {
                throw badRequest("HTTP Runner 当前只支持内联 JSON DSL，不支持 FILE 脚本");
            }
            validateHttpDsl(request.getSourceContent());
        }
        if ("BROWSER".equals(request.getScriptLanguage())) {
            if (!"INLINE".equals(request.getSourceType())) {
                throw badRequest("Browser Runner only accepts inline JSON DSL");
            }
            try {
                BrowserDslPolicy.validate(request.getSourceContent(), objectMapper);
            } catch (IllegalArgumentException exception) {
                throw badRequest(exception.getMessage());
            }
        }
        if ("NODE".equals(request.getScriptLanguage())) {
            if (!"INLINE".equals(request.getSourceType())) {
                throw badRequest("Node Runner v1 只支持内联 JavaScript，不支持 FILE 脚本");
            }
            if (!request.getEntryPoint().matches("[A-Za-z_$][A-Za-z0-9_$]{0,63}")) {
                throw badRequest("Node Runner entryPoint 必须是有效的 JavaScript 函数名");
            }
        }

        if (StringUtils.hasText(request.getArgumentsJson())) {
            try {
                JsonNode node = objectMapper.readTree(request.getArgumentsJson());
                if (!node.isObject() && !node.isArray()) throw badRequest("脚本参数必须是 JSON 对象或数组");
                request.setArgumentsJson(objectMapper.writeValueAsString(node));
            } catch (JsonProcessingException exception) {
                throw badRequest("脚本参数必须是合法 JSON");
            }
        } else {
            request.setArgumentsJson(null);
        }
    }

    /**
     * HTTP 脚本只登记受限 JSON DSL，不接受任意 URL、写请求或可执行代码。
     * 目标主机由测试轮次绑定的环境 baseUrl/apiBaseUrl 决定。
     */
    private void validateHttpDsl(String content) {
        JsonNode root;
        try {
            root = objectMapper.readTree(content);
        } catch (JsonProcessingException exception) {
            throw badRequest("HTTP 脚本必须是合法 JSON DSL");
        }
        if (root == null || !root.isObject() || root.path("version").asInt(-1) != 1) {
            throw badRequest("HTTP DSL 必须是 version=1 的 JSON 对象");
        }

        JsonNode request = root.get("request");
        if (request == null || !request.isObject()) {
            throw badRequest("HTTP DSL 必须包含 request 对象");
        }
        String base = upper(request.path("base").asText("API"));
        if (!Arrays.asList("API", "WEB").contains(base)) {
            throw badRequest("HTTP request.base 仅支持 API 或 WEB");
        }
        String method = upper(request.path("method").asText("GET"));
        if (!Arrays.asList("GET", "HEAD", "OPTIONS").contains(method)) {
            throw badRequest("HTTP Runner 第一阶段仅允许 GET、HEAD、OPTIONS 只读请求");
        }
        String path = request.path("path").asText(null);
        if (!isSafeHttpPath(path)) {
            throw badRequest("HTTP request.path 必须是环境地址下的安全相对路径");
        }
        if (request.hasNonNull("body")) {
            throw badRequest("HTTP Runner 第一阶段不支持请求体和写操作");
        }
        if (request.has("timeoutMs")) {
            JsonNode timeout = request.get("timeoutMs");
            if (!timeout.isIntegralNumber() || timeout.asInt() < 1000 || timeout.asInt() > 30000) {
                throw badRequest("HTTP timeoutMs 必须在 1000 到 30000 毫秒之间");
            }
        }

        JsonNode headers = request.get("headers");
        if (headers != null) {
            if (!headers.isObject()) throw badRequest("HTTP headers 必须是 JSON 对象");
            java.util.Iterator<Map.Entry<String, JsonNode>> fields = headers.fields();
            while (fields.hasNext()) {
                Map.Entry<String, JsonNode> field = fields.next();
                String name = field.getKey().toLowerCase(Locale.ROOT);
                if (SENSITIVE_HTTP_FIELD.matcher(name).find()
                        || Arrays.asList("authorization", "cookie", "set-cookie", "host",
                        "content-length", "transfer-encoding", "connection",
                        "proxy-authorization").contains(name)) {
                    throw badRequest("HTTP DSL 不允许自定义认证、Cookie 或连接控制请求头");
                }
                if (!field.getValue().isTextual()
                        || field.getValue().asText().length() > 2048
                        || field.getValue().asText().contains("\r")
                        || field.getValue().asText().contains("\n")) {
                    throw badRequest("HTTP 请求头值必须是长度不超过 2048 的单行字符串");
                }
            }
        }

        JsonNode query = request.get("query");
        if (query != null) {
            if (!query.isObject()) throw badRequest("HTTP query 必须是 JSON 对象");
            java.util.Iterator<Map.Entry<String, JsonNode>> fields = query.fields();
            while (fields.hasNext()) {
                Map.Entry<String, JsonNode> field = fields.next();
                if (SENSITIVE_HTTP_FIELD.matcher(field.getKey()).find()) {
                    throw badRequest("HTTP DSL 不允许在 query 参数中保存认证凭据，请使用环境凭据引用");
                }
                JsonNode value = field.getValue();
                if (!value.isValueNode() || value.isNull()
                        || String.valueOf(value.asText()).length() > 2048) {
                    throw badRequest("HTTP query 参数只允许字符串、数字或布尔值");
                }
            }
        }

        JsonNode assertions = root.get("assertions");
        if (assertions == null || !assertions.isArray()
                || assertions.size() == 0 || assertions.size() > 20) {
            throw badRequest("HTTP DSL 必须包含 1 到 20 条断言");
        }
        for (JsonNode assertion : assertions) {
            if (!assertion.isObject()) throw badRequest("HTTP 断言必须是 JSON 对象");
            String type = upper(assertion.path("type").asText(null));
            if ("STATUS_EQUALS".equals(type)) {
                if (!assertion.path("expected").isIntegralNumber()
                        || assertion.path("expected").asInt() < 100
                        || assertion.path("expected").asInt() > 599) {
                    throw badRequest("STATUS_EQUALS.expected 必须是 100 到 599 的 HTTP 状态码");
                }
            } else if ("HEADER_EQUALS".equals(type)) {
                if (!StringUtils.hasText(assertion.path("name").asText(null))
                        || !assertion.path("expected").isTextual()) {
                    throw badRequest("HEADER_EQUALS 必须提供 name 和字符串 expected");
                }
            } else if ("JSON_PATH_EQUALS".equals(type)) {
                if (!isSafeJsonPath(assertion.path("path").asText(null))
                        || !assertion.has("expected")) {
                    throw badRequest("JSON_PATH_EQUALS 必须提供安全 JSONPath 和 expected");
                }
            } else if ("JSON_PATH_EXISTS".equals(type)) {
                if (!isSafeJsonPath(assertion.path("path").asText(null))) {
                    throw badRequest("JSON_PATH_EXISTS 必须提供安全 JSONPath");
                }
            } else if ("BODY_CONTAINS".equals(type)) {
                if (!assertion.path("expected").isTextual()
                        || assertion.path("expected").asText().length() > 2048) {
                    throw badRequest("BODY_CONTAINS.expected 必须是长度不超过 2048 的字符串");
                }
            } else {
                throw badRequest("不支持的 HTTP 断言类型：" + type);
            }
        }
    }

    private boolean isSafeHttpPath(String path) {
        if (!StringUtils.hasText(path) || path.length() > 1024
                || !path.startsWith("/") || path.startsWith("//")
                || path.contains("\\") || path.contains("?") || path.contains("#")
                || path.contains("://")) return false;
        String lower = path.toLowerCase(Locale.ROOT);
        if (lower.contains("%2e") || lower.contains("%2f") || lower.contains("%5c")) return false;
        for (String segment : path.split("/")) {
            if ("..".equals(segment) || ".".equals(segment)) return false;
        }
        return true;
    }

    private boolean isSafeJsonPath(String path) {
        if (!StringUtils.hasText(path) || !path.startsWith("$.") || path.length() > 256) return false;
        for (int i = 0; i < path.length(); i++) {
            char c = path.charAt(i);
            if (!(Character.isLetterOrDigit(c) || c == '_' || c == '$'
                    || c == '.' || c == '[' || c == ']' || c == '-')) return false;
        }
        return !path.contains("..");
    }

    private ScriptRevisionInsert toRevision(ScriptSaveRequest request, Long scriptId, int revisionNo) {
        ScriptRevisionInsert revision = new ScriptRevisionInsert();
        revision.setScriptId(scriptId);
        revision.setRevisionNo(revisionNo);
        revision.setScriptVersion(request.getScriptVersion());
        revision.setScriptLanguage(request.getScriptLanguage());
        revision.setRuntimeVersion(request.getRuntimeVersion());
        revision.setSourceType(request.getSourceType());
        revision.setSourcePath(request.getSourcePath());
        revision.setSourceContent(request.getSourceContent());
        revision.setEntryPoint(request.getEntryPoint());
        revision.setArgumentsJson(request.getArgumentsJson());
        revision.setChangeNote(request.getChangeNote());
        revision.setCreatedBy(request.getCreatedBy());
        return revision;
    }

    private void ensureUnique(String code, Long excludeId) {
        if (mapper.countByCode(code, excludeId) > 0) {
            throw new BusinessException(HttpStatus.CONFLICT.value(), "脚本编号已存在");
        }
    }

    private BusinessException badRequest(String message) {
        return new BusinessException(HttpStatus.BAD_REQUEST.value(), message);
    }

    private BusinessException notFound(String message) {
        return new BusinessException(HttpStatus.NOT_FOUND.value(), message);
    }

    private String upper(String value) {
        return StringUtils.hasText(value) ? value.trim().toUpperCase(Locale.ROOT) : null;
    }

    private String trim(String value) {
        return StringUtils.hasText(value) ? value.trim() : null;
    }
}
