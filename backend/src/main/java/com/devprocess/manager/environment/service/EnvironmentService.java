package com.devprocess.manager.environment.service;

import com.devprocess.manager.common.exception.BusinessException;
import com.devprocess.manager.environment.dto.EnvironmentDTO;
import com.devprocess.manager.environment.dto.EnvironmentSaveRequest;
import com.devprocess.manager.environment.mapper.EnvironmentMapper;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.net.URI;
import java.util.Arrays;
import java.util.List;
import java.util.Locale;

@Service
public class EnvironmentService {
    private static final List<String> TYPES =
            Arrays.asList("LOCAL", "TEST", "STAGING", "PROD", "OTHER");
    private static final List<String> AUTH_TYPES =
            Arrays.asList("NONE", "BEARER", "BASIC", "COOKIE", "API_KEY", "CUSTOM");
    private static final List<String> SECRET_KEYS =
            Arrays.asList("password", "token", "secret", "cookie", "authorization",
                    "apikey", "credential", "privatekey", "clientsecret");

    private final EnvironmentMapper mapper;
    private final ObjectMapper objectMapper;

    public EnvironmentService(EnvironmentMapper mapper, ObjectMapper objectMapper) {
        this.mapper = mapper;
        this.objectMapper = objectMapper;
    }

    public List<EnvironmentDTO> list(Boolean activeOnly) {
        return mapper.selectList(activeOnly);
    }

    public EnvironmentDTO get(Long id) {
        EnvironmentDTO environment = mapper.selectById(id);
        if (environment == null) throw notFound("测试环境不存在");
        return environment;
    }

    @Transactional
    public EnvironmentDTO create(EnvironmentSaveRequest request) {
        normalize(request);
        ensureUnique(request.getEnvironmentCode(), null);
        mapper.insert(request);
        if (request.getId() == null) throw new BusinessException(500, "创建环境失败：未返回主键");
        return get(request.getId());
    }

    @Transactional
    public EnvironmentDTO update(Long id, EnvironmentSaveRequest request) {
        if (mapper.selectByIdForUpdate(id) == null) throw notFound("测试环境不存在");
        normalize(request);
        ensureUnique(request.getEnvironmentCode(), id);
        mapper.update(id, request);
        return get(id);
    }

    private void normalize(EnvironmentSaveRequest request) {
        request.setEnvironmentCode(upper(request.getEnvironmentCode()));
        request.setEnvironmentName(request.getEnvironmentName().trim());
        request.setEnvironmentType(upper(request.getEnvironmentType()));
        request.setAuthType(StringUtils.hasText(request.getAuthType())
                ? upper(request.getAuthType()) : "NONE");
        request.setBaseUrl(normalizeUrl(request.getBaseUrl(), "环境地址"));
        request.setApiBaseUrl(normalizeUrl(request.getApiBaseUrl(), "API 地址"));
        request.setCredentialRef(trim(request.getCredentialRef()));
        request.setDescription(trim(request.getDescription()));
        request.setConfigJson(normalizeConfig(request.getConfigJson()));
        if (request.getSortOrder() == null) request.setSortOrder(0);
        if (!TYPES.contains(request.getEnvironmentType())) {
            throw badRequest("环境类型不合法");
        }
        if (!AUTH_TYPES.contains(request.getAuthType())) {
            throw badRequest("认证方式不合法");
        }
        if ("NONE".equals(request.getAuthType()) && request.getCredentialRef() != null) {
            throw badRequest("认证方式为 NONE 时不应配置 credentialRef");
        }
        if (!"NONE".equals(request.getAuthType()) && request.getCredentialRef() == null) {
            throw badRequest("请配置凭据引用；不要在此处填写密码、Token 或 Cookie");
        }
    }

    private String normalizeUrl(String value, String label) {
        if (!StringUtils.hasText(value)) return null;
        String text = value.trim();
        try {
            URI uri = URI.create(text);
            if (uri.getHost() == null || uri.getUserInfo() != null
                    || !("http".equalsIgnoreCase(uri.getScheme())
                    || "https".equalsIgnoreCase(uri.getScheme()))) {
                throw badRequest(label + "必须是 HTTP/HTTPS 地址，且不能包含用户名或密码");
            }
            return uri.toString();
        } catch (IllegalArgumentException exception) {
            throw badRequest(label + "格式不正确");
        }
    }

    private String normalizeConfig(String json) {
        if (!StringUtils.hasText(json)) return null;
        try {
            JsonNode node = objectMapper.readTree(json);
            if (!node.isObject()) throw badRequest("环境配置必须是 JSON 对象");
            rejectSecretKeys(node);
            return objectMapper.writeValueAsString(node);
        } catch (BusinessException exception) {
            throw exception;
        } catch (Exception exception) {
            throw badRequest("环境配置必须是合法 JSON");
        }
    }

    private void rejectSecretKeys(JsonNode node) {
        if (node.isObject()) {
            java.util.Iterator<java.util.Map.Entry<String, JsonNode>> fields = node.fields();
            while (fields.hasNext()) {
                java.util.Map.Entry<String, JsonNode> field = fields.next();
                String key = field.getKey().toLowerCase(Locale.ROOT).replace("_", "").replace("-", "");
                for (String secretKey : SECRET_KEYS) {
                    if (key.contains(secretKey)) {
                        throw badRequest("环境配置不能保存密码、Token、Cookie 等敏感信息，请使用 credentialRef");
                    }
                }
                rejectSecretKeys(field.getValue());
            }
        } else if (node.isArray()) {
            for (JsonNode item : node) rejectSecretKeys(item);
        }
    }

    private void ensureUnique(String code, Long excludeId) {
        if (mapper.countByCode(code, excludeId) > 0) {
            throw new BusinessException(HttpStatus.CONFLICT.value(), "环境编码已存在");
        }
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
