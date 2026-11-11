import { hostname } from 'node:os';
import { buildTargetUrl, evaluateAssertions, validateHttpDsl } from './http-dsl.mjs';

const managerUrl = (process.env.DPM_MANAGER_URL || 'http://127.0.0.1:18090').replace(/\/+$/, '');
const runnerToken = process.env.DPM_RUNNER_TOKEN || '';
const runnerId = process.env.DPM_RUNNER_ID || `http-runner-${hostname()}-${process.pid}`;
const pollIntervalMs = boundedNumber(process.env.DPM_POLL_INTERVAL_MS, 2000, 500, 30000);
const heartbeatIntervalMs = boundedNumber(process.env.DPM_HEARTBEAT_INTERVAL_MS, 15000, 5000, 30000);
const maxResponseBytes = 100 * 1024;
let stopping = false;

function boundedNumber(value, fallback, min, max) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(min, Math.min(Math.trunc(number), max)) : fallback;
}

function redactLogText(value) {
  return String(value ?? '')
    .replace(/Bearer\s+[A-Za-z0-9._~+/-]+=*/gi, 'Bearer [REDACTED]')
    .replace(/((?:password|passwd|token|authorization|cookie|secret|api[_-]?key|credential)\s*[:=]\s*)(?:"[^"]*"|'[^']*'|[^\s,;]+)/gi, '$1[REDACTED]')
    .replace(/([?&](?:access_token|refresh_token|token|api_key|secret)=)[^&\s]+/gi, '$1[REDACTED]');
}

function log(level, message, details = '') {
  const safeMessage = redactLogText(message);
  const suffix = details ? ` ${redactLogText(details)}` : '';
  process.stdout.write(`${new Date().toISOString()} [${level}] ${safeMessage}${suffix}${String.fromCharCode(10)}`);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
async function apiRequest(path, body, headers = {}) {
  const response = await fetch(`${managerUrl}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10000)
  });
  const text = await response.text();
  let payload = {};
  if (text) {
    try { payload = JSON.parse(text); }
    catch { throw new Error(`Runner API returned non-JSON HTTP ${response.status}`); }
  }
  if (!response.ok) {
    const message = payload.message || payload.error || `HTTP ${response.status}`;
    throw new Error(`Runner API ${path} failed: ${String(message).slice(0, 300)}`);
  }
  return payload;
}

function leaseHeaders(job) {
  return {
    'X-DPM-Runner-Id': job.runnerId,
    'X-DPM-Lease-Token': job.leaseToken
  };
}

async function claimTask() {
  return apiRequest('/api/runner/claim', { runnerId }, { 'X-DPM-Runner-Token': runnerToken });
}
async function sendEvent(job, eventType, eventKey, eventContent, eventData = null) {
  return apiRequest(`/api/runner/tasks/${job.task.id}/events`, {
    eventKey, eventType, eventContent,
    eventDataJson: eventData == null ? null : JSON.stringify(eventData),
    createdBy: job.runnerId
  }, leaseHeaders(job));
}

async function heartbeat(job) {
  return apiRequest(`/api/runner/tasks/${job.task.id}/heartbeat`, {}, leaseHeaders(job));
}

async function complete(job, result, actualResult, logExcerpt, errorMessage = null) {
  return apiRequest(`/api/runner/tasks/${job.task.id}/complete`, {
    result, actualResult: String(actualResult ?? '').slice(0, 10000),
    logExcerpt: String(logExcerpt ?? '').slice(0, 20000),
    errorMessage: errorMessage == null ? null : String(errorMessage).slice(0, 4000),
    executorName: job.runnerId
  }, leaseHeaders(job));
}

async function fail(job, errorMessage, logExcerpt = '') {
  return apiRequest(`/api/runner/tasks/${job.task.id}/fail`, {
    errorMessage: String(errorMessage).slice(0, 4000),
    logExcerpt: String(logExcerpt).slice(0, 20000)
  }, leaseHeaders(job));
}
async function readLimitedBody(response) {
  if (!response.body) return { bodyText: '', truncated: false };
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  let truncated = false;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const remaining = maxResponseBytes - total;
    if (value.byteLength > remaining) {
      if (remaining > 0) chunks.push(Buffer.from(value.subarray(0, remaining)));
      total += Math.max(remaining, 0);
      truncated = true;
      await reader.cancel().catch(() => {});
      break;
    }
    chunks.push(Buffer.from(value));
    total += value.byteLength;
  }
  return { bodyText: Buffer.concat(chunks).toString('utf8'), truncated };
}

function safeResponseHeaders(headers) {
  const result = {};
  for (const [name, value] of headers.entries()) {
    if (/(authorization|cookie|token|secret|api[_-]?key|credential)/i.test(name)) continue;
    result[name] = value.slice(0, 1024);
  }
  return result;
}

function parseResponseJson(contentType, bodyText) {
  if (!/\bjson\b/i.test(contentType) || !bodyText) return { jsonAvailable: false, json: null };
  try { return { jsonAvailable: true, json: JSON.parse(bodyText) }; }
  catch { return { jsonAvailable: false, json: null }; }
}
async function executeClaimed(payload) {
  const job = {
    runnerId: payload.runnerId || runnerId,
    leaseToken: payload.leaseToken,
    task: payload.task,
    execution: payload.execution
  };
  const snapshot = job.execution?.requestSnapshot;
  const environment = snapshot?.environmentSnapshot;
  const script = snapshot?.scriptSnapshot;
  if (!job.task?.id || !job.execution?.id || !job.leaseToken) {
    throw new Error('Claim response is missing task, execution or lease information');
  }
  await heartbeat(job);
  let dsl;
  try {
    dsl = validateHttpDsl(script?.sourceContent);
    if (String(script?.language).toUpperCase() !== 'HTTP'
        || String(script?.sourceType).toUpperCase() !== 'INLINE') {
      throw new Error('Claimed script is not an inline HTTP DSL');
    }
  } catch (error) {
    try { await fail(job, error.message); }
    catch (reportError) { log('ERROR', `Could not report invalid task ${job.task.id}`, reportError.message); }
    return;
  }
  const authType = String(environment?.authType ?? 'NONE').toUpperCase();
  if (authType !== 'NONE') {
    await complete(job, 'BLOCKED', 'HTTP Runner 第一阶段仅支持 NONE 认证', '',
      `环境认证方式 ${authType} 尚未接入安全凭据解析器`);
    return;
  }
  let target;
  try { target = buildTargetUrl(environment ?? {}, dsl.request); }
  catch (error) {
    await complete(job, 'BLOCKED', '测试环境地址未配置或无效', '', error.message);
    return;
  }
  const headers = new Headers({ accept: 'application/json, text/plain, */*' });
  for (const [name, value] of Object.entries(dsl.request.headers ?? {})) headers.set(name, value);
  const requestController = new AbortController();
  let leaseLost = false;
  let heartbeatBusy = false;
  const heartbeatTimer = setInterval(async () => {
    if (heartbeatBusy || leaseLost || stopping) return;
    heartbeatBusy = true;
    try { await heartbeat(job); }
    catch (error) {
      leaseLost = true;
      requestController.abort();
      log('ERROR', `Lease lost for task ${job.task.id}`, error.message);
    } finally { heartbeatBusy = false; }
  }, heartbeatIntervalMs);
  heartbeatTimer.unref?.();
  const stopHeartbeats = async () => {
    clearInterval(heartbeatTimer);
    while (heartbeatBusy) await sleep(25);
  };

  const startedAt = Date.now();
  const lines = [`HTTP ${dsl.request.method} ${dsl.request.path}`];
  try {
    await sendEvent(job, 'API_REQUEST', `http-${job.execution.id}-request`,
      `HTTP ${dsl.request.method} ${dsl.request.path}`, {
        base: dsl.request.base, method: dsl.request.method, path: dsl.request.path,
        query: dsl.request.query ?? {}, headerNames: [...headers.keys()]
      });
    let response;
    try {
      response = await fetch(target, {
        method: dsl.request.method, headers, redirect: 'manual',
        signal: AbortSignal.any([requestController.signal, AbortSignal.timeout(dsl.request.timeoutMs)])
      });
    } catch (error) {
      if (leaseLost) return;
      const message = error.name === 'TimeoutError' || error.name === 'AbortError'
        ? `HTTP request timed out or was aborted: ${error.message}` : `HTTP request failed: ${error.message}`;
      lines.push(message);
      await sendEvent(job, 'API_RESPONSE', `http-${job.execution.id}-response`, message,
        { networkError: error.name, message: error.message.slice(0, 1000) });
      await stopHeartbeats();
      await complete(job, 'BLOCKED', message, lines.join(String.fromCharCode(10)), message);
      return;
    }

    const { bodyText, truncated } = await readLimitedBody(response);
    if (leaseLost) return;
    const parsed = parseResponseJson(response.headers.get('content-type') ?? '', bodyText);
    const responseInfo = {
      status: response.status, statusText: response.statusText,
      headers: safeResponseHeaders(response.headers), bodyText, truncated
    };
    await sendEvent(job, 'API_RESPONSE', `http-${job.execution.id}-response`,
      `HTTP response ${response.status} (${Date.now() - startedAt} ms)`, responseInfo);

    const assertionResults = evaluateAssertions(dsl.assertions, {
      status: response.status, headers: response.headers, bodyText, ...parsed
    });
    for (const item of assertionResults) {
      const detail = `${item.description}: ${item.passed ? 'PASS' : 'FAIL'}`;
      lines.push(detail);
      await sendEvent(job, item.passed ? 'ASSERTION_PASSED' : 'ASSERTION_FAILED',
        `http-${job.execution.id}-assert-${item.index}`, detail, {
          index: item.index, type: item.type, expected: item.expected,
          actual: item.actual, passed: item.passed
        });
    }
    if (truncated) lines.push(`Response body exceeded ${maxResponseBytes} bytes and was truncated`);
    const allPassed = assertionResults.every(item => item.passed);
    const result = truncated ? 'BLOCKED' : (allPassed ? 'PASS' : 'FAIL');
    const actualResult = {
      status: response.status, durationMs: Date.now() - startedAt,
      truncated, assertions: assertionResults
    };
    const errorMessage = truncated ? `响应体超过 ${maxResponseBytes} 字节限制，断言结果不完整` : null;
    await stopHeartbeats();
    await complete(job, result, JSON.stringify(actualResult), lines.join(String.fromCharCode(10)), errorMessage);
    log('INFO', `Task ${job.task.id} completed`, `${result}; HTTP ${response.status}`);
  } catch (error) {
    if (leaseLost) return;
    await stopHeartbeats();
    log('ERROR', `Task ${job.task.id} execution engine error`, error.message);
    try { await fail(job, error.message, lines.join(String.fromCharCode(10))); }
    catch (reportError) { log('ERROR', `Could not report task ${job.task.id} failure`, reportError.message); }
  } finally {
    clearInterval(heartbeatTimer);
  }
}

async function main() {
  if (runnerToken.length < 32) throw new Error('DPM_RUNNER_TOKEN is missing or too short');
  if (!/^[A-Za-z0-9._-]{1,64}$/.test(runnerId)) throw new Error('DPM_RUNNER_ID is invalid');
  log('INFO', 'HTTP Runner started', `id=${runnerId}; manager=${managerUrl}`);
  while (!stopping) {
    try {
      const payload = await claimTask();
      if (!payload.claimed) {
        await sleep(pollIntervalMs);
        continue;
      }
      log('INFO', `Claimed task ${payload.task?.id}`, `cycle=${payload.task?.cycleId}`);
      await executeClaimed(payload);
    } catch (error) {
      log('ERROR', 'Runner polling failed', error.message);
      await sleep(5000);
    }
  }
  log('INFO', 'HTTP Runner stopped');
}

process.on('SIGINT', () => { stopping = true; });
process.on('SIGTERM', () => { stopping = true; });
main().catch(error => {
  log('FATAL', error.message);
  process.exitCode = 1;
});
