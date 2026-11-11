import { isDeepStrictEqual } from 'node:util';

const METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const SENSITIVE_NAME = /(password|passwd|token|authorization|cookie|secret|api[_-]?key|private[_-]?key|credential)/i;
const FORBIDDEN_HEADERS = new Set([
  'authorization', 'cookie', 'set-cookie', 'host', 'content-length',
  'transfer-encoding', 'connection', 'proxy-authorization'
]);
const ASSERTION_TYPES = new Set([
  'STATUS_EQUALS', 'HEADER_EQUALS', 'JSON_PATH_EQUALS',
  'JSON_PATH_EXISTS', 'BODY_CONTAINS'
]);

export function validateHttpDsl(source) {
  let dsl = source;
  if (typeof source === 'string') {
    try { dsl = JSON.parse(source); }
    catch { throw new Error('HTTP DSL must be valid JSON'); }
  }
  if (!dsl || typeof dsl !== 'object' || Array.isArray(dsl) || dsl.version !== 1) {
    throw new Error('HTTP DSL version must be 1');
  }
  const request = dsl.request;
  if (!request || typeof request !== 'object' || Array.isArray(request)) {
    throw new Error('HTTP DSL request object is required');
  }
  const base = String(request.base ?? 'API').toUpperCase();
  if (!['API', 'WEB'].includes(base)) throw new Error('request.base must be API or WEB');
  const method = String(request.method ?? 'GET').toUpperCase();
  if (!METHODS.has(method)) throw new Error('Only GET, HEAD and OPTIONS are allowed');
  const path = request.path;
  if (typeof path !== 'string' || path.length > 1024 || !path.startsWith('/')
      || path.startsWith('//') || path.includes(String.fromCharCode(92))
      || path.includes('?') || path.includes('#') || /%(2e|2f|5c)/i.test(path)) {
    throw new Error('request.path must be a safe relative path');
  }
  for (const part of path.split('/')) {
    let decoded;
    try { decoded = decodeURIComponent(part); }
    catch { throw new Error('request.path contains invalid encoding'); }
    if (decoded === '.' || decoded === '..' || decoded.includes('/')
        || decoded.includes(String.fromCharCode(92))) {
      throw new Error('request.path cannot contain traversal segments');
    }
  }
  if (request.body != null) throw new Error('HTTP DSL does not support request bodies');
  const timeoutMs = request.timeoutMs ?? 10000;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 30000) {
    throw new Error('request.timeoutMs must be between 1000 and 30000');
  }
  validateHeaders(request.headers);
  validateQuery(request.query);
  const assertions = dsl.assertions;
  if (!Array.isArray(assertions) || assertions.length < 1 || assertions.length > 20) {
    throw new Error('HTTP DSL requires 1 to 20 assertions');
  }
  for (const assertion of assertions) validateAssertion(assertion);
  return { version: 1, request: { ...request, base, method, timeoutMs }, assertions };
}
function validateHeaders(headers) {
  if (headers == null) return;
  if (typeof headers !== 'object' || Array.isArray(headers)) throw new Error('request.headers must be an object');
  for (const [name, value] of Object.entries(headers)) {
    const lower = name.toLowerCase();
    if (!/^[!#$%&'*+.^_`|~0-9a-z-]+$/i.test(name) || FORBIDDEN_HEADERS.has(lower)
        || SENSITIVE_NAME.test(name)) {
      throw new Error(`Sensitive or restricted request header is not allowed: ${name}`);
    }
    if (typeof value !== 'string' || value.length > 2048
        || value.includes(String.fromCharCode(13)) || value.includes(String.fromCharCode(10))) {
      throw new Error(`Invalid request header value: ${name}`);
    }
  }
}

function validateQuery(query) {
  if (query == null) return;
  if (typeof query !== 'object' || Array.isArray(query)) throw new Error('request.query must be an object');
  for (const [name, value] of Object.entries(query)) {
    if (!name || SENSITIVE_NAME.test(name)) throw new Error(`Sensitive query parameter is not allowed: ${name}`);
    if (!['string', 'number', 'boolean'].includes(typeof value)
        || String(value).length > 2048
        || name.includes(String.fromCharCode(13)) || name.includes(String.fromCharCode(10))) {
      throw new Error(`Invalid query parameter: ${name}`);
    }
  }
}
function validateAssertion(assertion) {
  if (!assertion || typeof assertion !== 'object' || Array.isArray(assertion)) {
    throw new Error('Each assertion must be an object');
  }
  const type = String(assertion.type ?? '').toUpperCase();
  if (!ASSERTION_TYPES.has(type)) throw new Error(`Unsupported assertion type: ${type}`);
  if (type === 'STATUS_EQUALS'
      && (!Number.isInteger(assertion.expected) || assertion.expected < 100 || assertion.expected > 599)) {
    throw new Error('STATUS_EQUALS.expected must be an HTTP status code');
  }
  if (type === 'HEADER_EQUALS'
      && (typeof assertion.name !== 'string' || !assertion.name.trim()
        || typeof assertion.expected !== 'string')) {
    throw new Error('HEADER_EQUALS requires name and string expected');
  }
  if (['JSON_PATH_EQUALS', 'JSON_PATH_EXISTS'].includes(type) && !isSafeJsonPath(assertion.path)) {
    throw new Error(`${type} requires a safe JSON path`);
  }
  if (type === 'JSON_PATH_EQUALS' && !Object.hasOwn(assertion, 'expected')) {
    throw new Error('JSON_PATH_EQUALS requires expected');
  }
  if (type === 'BODY_CONTAINS'
      && (typeof assertion.expected !== 'string' || assertion.expected.length > 2048)) {
    throw new Error('BODY_CONTAINS.expected must be a string of at most 2048 characters');
  }
}

function isSafeJsonPath(path) {
  return typeof path === 'string' && path.length <= 256
    && /^\$(?:\.[A-Za-z0-9_-]+|\[\d+\])+$/.test(path);
}
export function buildTargetUrl(environment, request) {
  const configured = request.base === 'WEB'
    ? environment.baseUrl : (environment.apiBaseUrl || environment.baseUrl);
  if (typeof configured !== 'string' || !configured.trim()) {
    throw new Error(`Environment ${request.base} base URL is not configured`);
  }
  const base = new URL(configured);
  if (!['http:', 'https:'].includes(base.protocol) || !base.hostname
      || base.username || base.password || base.search || base.hash) {
    throw new Error('Environment base URL must be an HTTP/HTTPS URL without credentials, query or fragment');
  }
  const basePath = base.pathname.endsWith('/') ? base.pathname : `${base.pathname}/`;
  const target = new URL(request.path.replace(/^\/+/, ''), `${base.origin}${basePath}`);
  if (target.origin !== base.origin || target.username || target.password) {
    throw new Error('Request target must stay on the configured environment host');
  }
  for (const [name, value] of Object.entries(request.query ?? {})) {
    target.searchParams.set(name, String(value));
  }
  return target;
}

export function resolveJsonPath(root, path) {
  if (!isSafeJsonPath(path)) return { found: false, value: undefined };
  let current = root;
  const parts = path.slice(1).match(/\.[A-Za-z0-9_-]+|\[\d+\]/g) ?? [];
  for (const part of parts) {
    if (part.startsWith('.')) {
      const key = part.slice(1);
      if (current == null || typeof current !== 'object' || !Object.hasOwn(current, key)) {
        return { found: false, value: undefined };
      }
      current = current[key];
    } else {
      const index = Number(part.slice(1, -1));
      if (!Array.isArray(current) || index >= current.length) return { found: false, value: undefined };
      current = current[index];
    }
  }
  return { found: true, value: current };
}
export function evaluateAssertions(assertions, response) {
  return assertions.map((assertion, index) => {
    const type = String(assertion.type).toUpperCase();
    let actual;
    let passed = false;
    if (type === 'STATUS_EQUALS') {
      actual = response.status;
      passed = actual === assertion.expected;
    } else if (type === 'HEADER_EQUALS') {
      actual = response.headers.get(assertion.name);
      passed = actual === assertion.expected;
    } else if (type === 'BODY_CONTAINS') {
      actual = response.bodyText.includes(assertion.expected);
      passed = actual;
    } else if (type === 'JSON_PATH_EQUALS' || type === 'JSON_PATH_EXISTS') {
      const resolved = response.jsonAvailable
        ? resolveJsonPath(response.json, assertion.path) : { found: false };
      actual = resolved.found ? resolved.value : '<missing-or-non-json>';
      passed = type === 'JSON_PATH_EXISTS' ? resolved.found
        : resolved.found && isDeepStrictEqual(resolved.value, assertion.expected);
    }
    return {
      index: index + 1, type, passed,
      description: assertion.description ?? `${type} #${index + 1}`,
      expected: assertion.expected ?? null,
      actual
    };
  });
}
