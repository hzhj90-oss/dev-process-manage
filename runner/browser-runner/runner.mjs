import { hostname } from 'node:os';
import { executeBrowserScript } from './browser-engine.mjs';

const managerUrl = (process.env.DPM_MANAGER_URL || 'http://127.0.0.1:18090').replace(/\/+$/, '');
const runnerToken = process.env.DPM_RUNNER_TOKEN || '';
const runnerId = process.env.DPM_RUNNER_ID || ('browser-' + hostname().toLowerCase());
const chromePath = process.env.DPM_CHROME_PATH || '';
const pollIntervalMs = 2000;
let stopping = false;
let activeExecutionAbort = null;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
function redact(value) {
  return String(value ?? '')
    .replace(/Bearer\s+[A-Za-z0-9._~+/-]+=*/gi, 'Bearer [REDACTED]')
    .replace(/((?:password|passwd|token|authorization|cookie|secret|api[_-]?key|credential)\s*[:=]\s*)(?:"[^"]*"|'[^']*'|[^\s,;]+)/gi, '$1[REDACTED]')
    .replace(/([?&](?:access_token|refresh_token|token|api_key|secret)=)[^&\s]+/gi, '$1[REDACTED]');
}
function log(level, message, detail = '') {
  process.stdout.write(new Date().toISOString() + ' [' + level + '] '
    + redact(message) + (detail ? ' ' + redact(detail) : '') + '\n');
}
async function api(path, body, headers = {}) {
  const response = await fetch(managerUrl + path, {
    method: 'POST', headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body), signal: AbortSignal.timeout(10000)
  });
  const text = await response.text();
  let data = {};
  try { if (text) data = JSON.parse(text); } catch { throw Error('Runner API returned invalid JSON'); }
  if (!response.ok) throw Error('Runner API HTTP ' + response.status + ': ' + redact(data.message || 'request failed'));
  return data;
}
function headers(job) {
  return { 'X-DPM-Runner-Id': job.runnerId, 'X-DPM-Lease-Token': job.leaseToken };
}
function claim() {
  return api('/api/runner/claim', { runnerId, runnerType: 'BROWSER' },
    { 'X-DPM-Runner-Token': runnerToken });
}
function heartbeat(job) {
  return api('/api/runner/tasks/' + job.task.id + '/heartbeat', {}, headers(job));
}
function event(job, type, key, content, data = null) {
  return api('/api/runner/tasks/' + job.task.id + '/events', {
    eventKey: key, eventType: type, eventContent: redact(content).slice(0, 1500),
    eventDataJson: data == null ? null : JSON.stringify(data),
    createdBy: job.runnerId
  }, headers(job));
}
function complete(job, result, actual, lines, errorMessage = null) {
  return api('/api/runner/tasks/' + job.task.id + '/complete', {
    result, actualResult: String(actual).slice(0, 10000),
    logExcerpt: redact(lines.join('\n')).slice(0, 20000),
    errorMessage: errorMessage == null ? null : redact(errorMessage).slice(0, 4000),
    executorName: job.runnerId
  }, headers(job));
}
function fail(job, message, lines) {
  return api('/api/runner/tasks/' + job.task.id + '/fail', {
    errorMessage: redact(message).slice(0, 4000),
    logExcerpt: redact(lines.join('\n')).slice(0, 20000)
  }, headers(job));
}
async function screenshot(job, name, buffer) {
  const form = new FormData();
  form.append('file', new Blob([buffer], { type: 'image/png' }), name);
  const path = '/api/execution-tasks/' + job.task.id
    + '/executions/' + job.execution.id + '/attachments'
    + '?type=SCREENSHOT&createdBy=' + encodeURIComponent(job.runnerId);
  const response = await fetch(managerUrl + path, {
    method: 'POST', body: form, signal: AbortSignal.timeout(10000)
  });
  if (!response.ok) throw Error('Screenshot attachment upload HTTP ' + response.status);
}
async function executeClaimed(payload) {
  const job = { runnerId: payload.runnerId || runnerId, leaseToken: payload.leaseToken,
    task: payload.task, execution: payload.execution };
  const snapshot = job.execution?.requestSnapshot;
  const script = snapshot?.scriptSnapshot;
  const environment = snapshot?.environmentSnapshot;
  const lines = [];
  if (!job.task?.id || !job.execution?.id || !job.leaseToken
    || job.execution.runnerType !== 'BROWSER'
    || String(script?.language).toUpperCase() !== 'BROWSER'
    || String(script?.sourceType).toUpperCase() !== 'INLINE'
    || typeof script?.sourceContent !== 'string') {
    if (job.task?.id && job.leaseToken) await fail(job, 'Invalid Browser Runner task snapshot', []);
    return;
  }
  await heartbeat(job);
  let busy = false;
  let leaseLost = false;
  const executionAbort = new AbortController();
  activeExecutionAbort = executionAbort;
  const timer = setInterval(async () => {
    if (busy || leaseLost || stopping) return;
    busy = true;
    try { await heartbeat(job); }
    catch (error) {
      leaseLost = true;
      executionAbort.abort();
      log('ERROR', 'Browser Runner lease lost for task ' + job.task.id, error.message);
    } finally { busy = false; }
  }, 15000);
  timer.unref?.();
  const stop = async () => { clearInterval(timer); while (busy) await sleep(25); };
  try {
    await event(job, 'STEP_STARTED', 'browser-' + job.execution.id + '-start', 'Browser automation started');
    const environmentIsProduction = [job.task.environmentType, environment?.environmentType]
      .some(type => String(type ?? '').toUpperCase() === 'PROD');
    if (environmentIsProduction) throw Error('Production Browser Runner tasks are forbidden');
    const result = await executeBrowserScript({
      source: script.sourceContent,
      environment: { ...environment, environmentType: environment?.environmentType || job.task.environmentType },
      chromePath,
      shouldAbort: () => leaseLost || stopping,
      abortSignal: executionAbort.signal,
      onStep: async (index, step) => {
        if (leaseLost || stopping) return;
        const type = step.action.startsWith('ASSERT_') ? 'ASSERTION_PASSED' : 'STEP_COMPLETED';
        await event(job, type, 'browser-' + job.execution.id + '-step-' + index,
          'Browser step ' + (index + 1) + ': ' + step.action, {
            action: step.action // selectors may contain sensitive application data
          });
      },
      onScreenshot: async (name, buffer) => {
        if (!leaseLost && !stopping) await screenshot(job, name, buffer);
      }
    });
    if (leaseLost || stopping) return;
    lines.push(...result.logs);
    await stop();
    if (leaseLost || stopping) return;
    await complete(job, 'PASS', JSON.stringify({
      runtime: 'playwright-chrome', assertions: result.passedAssertions,
      screenshots: result.screenshots
    }), lines);
    log('INFO', 'Browser task completed', 'task=' + job.task.id);
  } catch (error) {
    if (leaseLost || stopping) return;
    const message = redact(error.message);
    lines.push(message);
    await stop();
    const assertionFailed = message.startsWith('ASSERTION_FAILED:');
    if (assertionFailed) {
      try {
        await event(job, 'ASSERTION_FAILED', 'browser-' + job.execution.id + '-assertion-failed',
          message, { result: 'FAIL', runtime: 'playwright-chrome' });
      } catch (eventError) {
        log('WARN', 'Could not record assertion failure event', eventError.message);
      }
    }
    try {
      await complete(job, assertionFailed ? 'FAIL' : 'BLOCKED',
        message, lines, message);
    } catch (reportError) {
      try { await fail(job, message, lines); }
      catch (nested) { log('ERROR', 'Unable to report browser task', nested.message); }
    }
    log('ERROR', 'Browser task did not pass', 'task=' + job.task.id + ' ' + message);
  } finally {
    clearInterval(timer);
    if (activeExecutionAbort === executionAbort) activeExecutionAbort = null;
  }
}
async function main() {
  if (!/^http:\/\/(?:127\.0\.0\.1|localhost):\d+$/.test(managerUrl))
    throw Error('Browser Runner v1 connects only to a local loopback manager');
  if (runnerToken.length < 32 || !/^[A-Za-z0-9._-]{1,64}$/.test(runnerId))
    throw Error('DPM_RUNNER_TOKEN or DPM_RUNNER_ID missing/invalid');
  log('INFO', 'Browser Runner ready', runnerId);
  while (!stopping) {
    try {
      const task = await claim();
      if (task.claimed) await executeClaimed(task);
      else await sleep(pollIntervalMs);
    } catch (error) {
      log('ERROR', 'Browser Runner polling error', error.message);
      await sleep(5000);
    }
  }
}
function requestStop() {
  stopping = true;
  activeExecutionAbort?.abort();
}
process.on('SIGINT', requestStop);
process.on('SIGTERM', requestStop);
main().catch(error => { log('FATAL', error.message); process.exitCode = 1; });

