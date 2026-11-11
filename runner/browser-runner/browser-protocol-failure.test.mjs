import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

test('Browser Runner records failing assertion and automatically uploads screenshot', { timeout: 30000 }, async () => {
  const manager = 'http://127.0.0.1:18090';
  const health = await fetch(manager + '/api/health');
  if (!health.ok) throw new Error('Start the local manager before browser integration test');
  const events = [];
  let screenshots = 0;
  let claimed = false;
  let resolveResult;
  let rejectResult;
  const finished = new Promise((resolve, reject) => {
    resolveResult = resolve; rejectResult = reject;
  });
  const source = JSON.stringify({ version: 1, timeoutMs: 25000, steps: [
    { action: 'GOTO', path: '/#/test-reports' },
    { action: 'ASSERT_TEXT', selector: 'h1', expected: 'intentionally-missing-browser-heading' }
  ] });
  const reply = (response, status, data) => {
    response.writeHead(status, { 'content-type': 'application/json' });
    response.end(JSON.stringify(data));
  };
  const server = createServer(async (request, response) => {
    try {
      const chunks = [];
      for await (const chunk of request) chunks.push(chunk);
      const bytes = Buffer.concat(chunks);
      const path = new URL(request.url, 'http://localhost').pathname;
      if (path === '/api/runner/claim') {
        const parameters = JSON.parse(bytes.toString());
        assert.equal(parameters.runnerType, 'BROWSER');
        assert.equal(request.headers['x-dpm-runner-token'], 'a'.repeat(48));
        if (claimed) return reply(response, 200, { claimed: false });
        claimed = true;
        return reply(response, 200, {
          claimed: true, runnerId: 'browser-protocol-test', leaseToken: 'b'.repeat(64),
          task: { id: 101, cycleId: 100, environmentType: 'DEV' },
          execution: { id: 102, runnerType: 'BROWSER', requestSnapshot: {
            environmentSnapshot: { baseUrl: manager, authType: 'NONE' },
            scriptSnapshot: { language: 'BROWSER', sourceType: 'INLINE', sourceContent: source }
          } }
        });
      }
      if (!path.endsWith('/attachments')) {
        assert.equal(request.headers['x-dpm-runner-id'], 'browser-protocol-test');
        assert.equal(request.headers['x-dpm-lease-token'], 'b'.repeat(64));
      }
      if (path.endsWith('/heartbeat')) return reply(response, 200, { success: true });
      if (path.endsWith('/events')) {
        events.push(JSON.parse(bytes.toString()));
        return reply(response, 200, { success: true });
      }
      if (path.endsWith('/attachments')) {
        assert.match(request.headers['content-type'], /multipart\/form-data/);
        assert.ok(bytes.includes(Buffer.from('89504e470d0a1a0a', 'hex')));
        assert.ok(bytes.includes(Buffer.from('browser-failure.png')));
        screenshots++;
        return reply(response, 201, { id: 1 });
      }
      if (path.endsWith('/complete')) {
        const completed = JSON.parse(bytes.toString());
        reply(response, 200, { success: true });
        resolveResult(completed);
        return;
      }
      if (path.endsWith('/fail')) {
        reply(response, 200, { success: true });
        rejectResult(Error('Browser Runner reported task failure: ' + bytes.toString()));
        return;
      }
      reply(response, 404, { message: 'Unknown mock route' });
    } catch (error) {
      reply(response, 500, { message: error.message });
      rejectResult(error);
    }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const child = spawn(process.execPath, ['runner.mjs'], {
    cwd: fileURLToPath(new URL('.', import.meta.url)),
    env: { ...process.env, DPM_MANAGER_URL: 'http://127.0.0.1:' + port,
      DPM_RUNNER_TOKEN: 'a'.repeat(48), DPM_RUNNER_ID: 'browser-protocol-test',
      DPM_CHROME_PATH: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' },
    windowsHide: true, stdio: ['ignore', 'pipe', 'pipe']
  });
  let stderr = '';
  child.stderr.on('data', bytes => { stderr += bytes.toString().slice(0, 1000); });
  child.on('error', rejectResult);
  const timeout = setTimeout(() => rejectResult(Error('Browser integration timeout ' + stderr)), 22000);
  try {
    const result = await finished;
    assert.equal(result.result, 'FAIL');
    assert.match(result.actualResult, /ASSERTION_FAILED:/);
    assert.equal(screenshots, 1);
    assert.ok(events.filter(item => item.eventType === 'ASSERTION_FAILED').length >= 1);
  } finally {
    clearTimeout(timeout);
    child.kill('SIGTERM');
    server.close();
  }
});
