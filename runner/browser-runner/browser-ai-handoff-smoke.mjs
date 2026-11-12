import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';

const base = 'http://127.0.0.1:18090';
const sample = [{
  task: { id: 987654, taskNo: 'DPM-E2E-MOCK-AI', cycleId: 24,
    taskType: 'EXECUTE_CASE', taskStatus: 'PENDING',
    cycleName: 'AI handoff UI verification', environmentName: 'Local', environmentType: 'TEST' },
  execution: { id: 876543, taskId: 987654, runnerType: 'CHATGPT', executionMode: 'AI',
    executionStatus: 'QUEUED', expectedResultSnapshot: 'Health is UP',
    requestSnapshot: { caseSnapshot: { caseNo: 'TC-AI-MOCK', title: 'Check local health endpoint' },
      environmentSnapshot: { credentialRef: 'MUST-NOT-APPEAR' } } }
}];
const browser = await chromium.launch({
  executablePath: process.env.DPM_CHROME_PATH,
  headless: true, args: ['--disable-extensions', '--no-first-run']
});
try {
  const context = await browser.newContext({ permissions: ['clipboard-read','clipboard-write'], acceptDownloads: true });
  const page = await context.newPage();
  let postCount = 0;
  page.on('request', request => {
    if (request.url().startsWith(base + '/api/') && request.method() !== 'GET') postCount++;
  });
  await page.route('**/api/execution-tasks/claimable/chatgpt?**', route => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify(sample)
  }));
  await page.route('**/api/execution-tasks/987654', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({
      task: { ...sample[0].task, taskStatus: 'RUNNING',
        heartbeatAt: new Date(Date.now() - 6 * 60 * 1000).toISOString() },
      executions: [{ ...sample[0].execution, attemptNo: 2,
        executionStatus: 'RUNNING',
        checkpointJson: JSON.stringify({ step: 1, apiKey: 'NEVER-COPY-CHECKPOINT' }),
        events: [{ id: 1, eventType: 'STEP_COMPLETED', eventContent: 'Step completed' }] },
        { id: 876542, taskId: 987654, attemptNo: 1, runnerType: 'CHATGPT',
          executionMode: 'AI', executionStatus: 'INTERRUPTED',
          checkpointJson: JSON.stringify({ password: 'SHOULD-NOT-BE-COPIED' }),
          events: [{ id: 2, eventType: 'EXECUTION_INTERRUPTED',
            eventContent: 'password=SHOULD-NOT-BE-COPIED', createdAt: '2026-11-11T16:20:00' }] }]
    })
  }));
  const auditCalls = [];
  await page.route('**/api/execution-tasks/audit/chatgpt?**', route => {
    const url = new URL(route.request().url());
    auditCalls.push(url.searchParams.toString());
    const recoveredOnly = url.searchParams.get('recoveredOnly') === 'true';
    const rows = [{
      taskId: 987654, taskNo: 'DPM-E2E-MOCK-AI', caseNo: 'TC-AI-MOCK',
      cycleName: 'AI handoff UI verification', projectName: 'Local Verification',
      taskStatus: 'RUNNING', executionId: 876543, attemptNo: 2,
      executionStatus: 'RUNNING', result: null, hasCheckpoint: 1, eventCount: 3
    }, {
      taskId: 987655, taskNo: 'DPM-E2E-MOCK-AI-2', caseNo: 'TC-AI-MOCK-2',
      cycleName: 'AI handoff UI verification', projectName: 'Local Verification',
      taskStatus: 'COMPLETED', executionId: 876544, attemptNo: 1,
      executionStatus: 'COMPLETED', result: 'PASS', hasCheckpoint: 0, eventCount: 2
    }];
    const filtered = recoveredOnly ? rows.slice(0, 1) : rows;
    route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ list: filtered, total: filtered.length,
        pageNum: Number(url.searchParams.get('pageNum') || 1),
        pageSize: Number(url.searchParams.get('pageSize') || 20) })
    });
  });
  await page.goto(base + '/#/ai-execution', { waitUntil: 'domcontentloaded' });
  await page.getByText('TC-AI-MOCK', { exact:true }).first().waitFor({state:'visible',timeout:12000});
  await page.getByRole('button', { name: '生成执行指令' }).click();
  const dialog = page.locator('.el-dialog:visible');
  await dialog.getByText('交给 ChatGPT 执行').waitFor();
  const text = await dialog.locator('textarea').inputValue();
  assert.match(text, /taskId: 987654/);
  assert.match(text, /executionId: 876543/);
  assert.match(text, /CHECKPOINT/);
  assert.match(text, /chatgpt-task\.mjs/);
  await page.getByText('任务状态追踪').waitFor();
  await page.getByText('最新尝试：').waitFor({ state: 'visible', timeout: 10000 });
  await page.getByText(/最近心跳已超过 5 分钟/).waitFor({ state: 'visible', timeout: 10000 });
  assert.doesNotMatch(text, /MUST-NOT-APPEAR/);
  await dialog.getByRole('button', { name: '复制执行指令' }).click();
  const actual = await page.evaluate(async () => navigator.clipboard.readText());
  // Windows clipboard normalizes line endings to CRLF.
  assert.equal(actual.replace(/\r\n/g, '\n'), text.replace(/\r\n/g, '\n'));
  await dialog.getByRole('button', { name: '关闭' }).click();
  await page.getByRole('button', { name: '生成续执行指令' }).click();
  await dialog.getByText('ChatGPT 断点续执行').waitFor();
  const continuation = await dialog.locator('textarea').inputValue();
  assert.match(continuation, /plan 987654 876543/);
  assert.match(continuation, /绝对不要再次调用 start/);
  assert.doesNotMatch(continuation, /MUST-NOT-APPEAR|NEVER-COPY-CHECKPOINT/);
  await dialog.getByRole('button', { name: '关闭' }).click();
  await page.getByText('尝试 #1 · 执行记录 #876542').waitFor();
  assert.equal(await page.locator('.audit-attempt').count(), 2);
  assert.match(await page.locator('.audit-history').innerText(), /password=\[REDACTED\]/);
  await page.getByRole('button', { name: '复制脱敏诊断摘要' }).click();
  const auditText = await page.evaluate(async () => navigator.clipboard.readText());
  assert.match(auditText, /execution #876542/);
  assert.match(auditText, /execution #876543/);
  assert.doesNotMatch(auditText, /MUST-NOT-APPEAR|NEVER-COPY-CHECKPOINT|SHOULD-NOT-BE-COPIED/);
  const auditKeyword = page.locator('.audit-search input').first();
  await auditKeyword.fill('changed-but-not-queried');
  assert.equal(await page.getByRole('button', { name: '导出筛选结果 CSV' }).isDisabled(), true);
  await auditKeyword.fill('');
  await page.getByText('仅中断恢复记录', { exact: true }).click();
  await page.getByRole('button', { name: '查询', exact: true }).click();
  await page.getByText('TC-AI-MOCK-2', { exact: true }).waitFor({state:'hidden'});
  assert.ok(auditCalls.some(x => x.includes('recoveredOnly=true')), 'Backend filter was not sent');
  const pendingDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出筛选结果 CSV' }).click();
  const download = await pendingDownload;
  assert.match(download.suggestedFilename(), /^dpm-chatgpt-audit-.+\.csv$/);
  const stream = await download.createReadStream();
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  const csv = Buffer.concat(chunks).toString('utf8');
  assert.match(csv, /"987654"/);
  assert.doesNotMatch(csv, /987655|NEVER-COPY-CHECKPOINT|SHOULD-NOT-BE-COPIED|MUST-NOT-APPEAR/);
  assert.equal(postCount, 0, 'Handoff and audit UI must never start or resume tasks');
  console.log('CHATGPT_HANDOFF_UI_PASS copied=true continuation=true audit=2 filteredExport=true postRequests=0');
  await context.close();
} finally {
  await browser.close();
}
