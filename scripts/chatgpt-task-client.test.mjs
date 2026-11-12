import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { Readable } from 'node:stream';
import { runAiCommand, safeBase } from './chatgpt-task-client.mjs';

function makeFixture() {
  const task = { id: 29, taskType: 'EXECUTE_CASE', taskStatus: 'PENDING',
    taskNo: 'DPM-AI-29', environmentType: 'TEST' };
  const latest = { id: 21, taskId: 29, executionMode: 'AI', runnerType: 'CHATGPT',
    executionStatus: 'QUEUED', attemptNo: 1, events: [], result: null,
    requestSnapshotJson: JSON.stringify({
      caseSnapshot: { caseNo: 'TC-29', title: 'Health check',
        aiInstruction: 'GET /api/health and verify UP',
        testData: 'password=DO-NOT-REVEAL' },
      environmentSnapshot: { environmentType: 'TEST', authType: 'NONE',
        baseUrl: 'http://127.0.0.1:18090',
        credentialRef: 'DO-NOT-REVEAL-REF' }
    }) };
  return { task, executions: [latest] };
}
async function withMock(fn, initial = makeFixture()) {
  let detail = structuredClone(initial);
  const writes = [];
  const server = createServer(async (req, res) => {
    let body = '';
    for await (const chunk of req) body += chunk;
    const send = (status, payload) => {
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(payload));
    };
    const pathname = new URL(req.url, 'http://127.0.0.1').pathname;
    if (req.method === 'GET' && pathname.endsWith('/claimable/chatgpt')) {
      return send(200, [{ task: detail.task,
        execution: { ...detail.executions[0],
          requestSnapshot: JSON.parse(detail.executions[0].requestSnapshotJson) } }]);
    }
    if (req.method === 'GET' && pathname === '/api/execution-tasks/29') {
      return send(200, detail);
    }
    if (req.method === 'POST') {
      writes.push({ pathname, body: JSON.parse(body) });
      const latest = detail.executions[0];
      if (pathname.endsWith('/start') &&
          detail.task.taskStatus === 'PENDING' && latest.executionStatus === 'QUEUED') {
        detail.task.taskStatus = 'RUNNING';
        latest.executionStatus = 'RUNNING';
        return send(200, detail);
      }
      if (pathname.endsWith('/events') &&
          detail.task.taskStatus === 'RUNNING' && latest.executionStatus === 'RUNNING') {
        const payload = JSON.parse(body);
        if (!latest.events.some(e => e.eventKey === payload.eventKey)) {
          latest.events.push({ eventKey: payload.eventKey, eventType: payload.eventType });
        }
        if (payload.eventType === 'WAITING_HUMAN') {
          detail.task.taskStatus = 'WAITING_HUMAN';
          latest.executionStatus = 'WAITING_HUMAN';
        }
        return send(200, detail);
      }
      if (pathname.endsWith('/complete') &&
          detail.task.taskStatus === 'RUNNING' && latest.executionStatus === 'RUNNING') {
        const payload = JSON.parse(body);
        latest.result = payload.result;
        latest.executionStatus = 'COMPLETED';
        detail.task.taskStatus = 'COMPLETED';
        return send(200, detail);
      }
      return send(409, { message: 'state conflict' });
    }
    return send(404, { message: 'not found' });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const baseUrl = 'http://127.0.0.1:' + server.address().port;
    return await fn({
      run: (args, extras = {}) => runAiCommand(args, { ...extras, baseUrl }), writes,
      replace: updated => { detail = structuredClone(updated); },
      snapshot: () => structuredClone(detail)
    });
  } finally { await new Promise(resolve => server.close(resolve)); }
}

test('accepts local HTTP only and rejects unexpected target hosts', () => {
  assert.equal(safeBase('http://127.0.0.1:18090'), 'http://127.0.0.1:18090');
  for (const url of [
    'https://127.0.0.1:18090', 'http://localhost:18090',
    'http://0.0.0.0:18090', 'http://127.0.0.1:18090/private',
    'http://evil.example:18090', 'http://user:pw@127.0.0.1:18090'
  ]) assert.throws(() => safeBase(url), /仅允许/);
});

test('queue and inspect are read-only and do not emit credentials', async () => {
  await withMock(async ({ run, writes }) => {
    const result = await run(['queue']);
    assert.equal(result.count, 1);
    assert.deepEqual(result.tasks[0].taskId, 29);
    const view = await run(['inspect', '29']);
    assert.equal(view.case.title, 'Health check');
    assert.equal(view.case.testData, 'password=[REDACTED]');
    assert.equal(view.environment.environmentType, 'TEST');
    assert.equal(JSON.stringify(view).includes('DO-NOT-REVEAL'), false);
    assert.equal(writes.length, 0);
  });
});

test('start, checkpoint, heartbeat, step events and completion form one safe attempt', async () => {
  await withMock(async ({ run, writes }) => {
    const started = await run(['start','29','21']);
    assert.equal(started.taskStatus, 'RUNNING');
    await assert.rejects(() => run(['start','29','21']), /任务状态已改变/);
    await run(['event','29','21','STEP_STARTED','step-1','Checking local health']);
    await run(['checkpoint','29','21','cp-1',
      JSON.stringify({ step: 1, password: 'MUST-NOT-PERSIST' })]);
    await run(['heartbeat','29','21']);
    const ended = await run(['complete','29','21','PASS','Actual HTTP 200 status UP']);
    assert.equal(ended.executionStatus, 'COMPLETED');
    assert.equal(ended.result, 'PASS');
    assert.equal(writes.filter(w => w.pathname.endsWith('/start')).length, 1);
    const cp = writes.find(w => w.body.eventType === 'CHECKPOINT');
    assert.equal(JSON.parse(cp.body.eventDataJson).password, '[REDACTED]');
    assert.equal(writes.filter(w => w.body.eventType === 'HEARTBEAT').length, 1);
    assert.equal(writes.filter(w => w.pathname.endsWith('/complete')).length, 1);
    await assert.rejects(() => run(['complete','29','21','PASS','Duplicate result']), /任务状态已改变/);
  });
});

test('human intervention pauses execution and blocks later completion', async () => {
  await withMock(async ({ run, writes }) => {
    await run(['start','29','21']);
    const paused = await run(['human','29','21','approval-1','Need operator approval']);
    assert.equal(paused.taskStatus, 'WAITING_HUMAN');
    await assert.rejects(
      () => run(['complete','29','21','PASS','Cannot claim success']),
      /任务状态已改变/

    );
    assert.equal(writes.filter(w => w.pathname.endsWith('/complete')).length, 0);
  });
});

test('stale IDs, wrong mode, production and invalid arguments fail before writing', async () => {
  for (const mutation of [
    d => { d.executions[0].id = 22; },
    d => { d.executions[0].runnerType = 'NODE'; },
    d => { d.task.environmentType = 'PROD'; },
    d => { d.task.taskStatus = 'CANCELLED'; }
  ]) {
    const fixture = makeFixture();
    mutation(fixture);
    await withMock(async ({ run, writes }) => {
      await assert.rejects(() => run(['start','29','21']));
      assert.equal(writes.length, 0);
    }, fixture);
  }
  await withMock(async ({ run, writes }) => {
    await assert.rejects(() => run(['start','0','21']), /正整数/);
    await assert.rejects(() => run(['complete','29','21','PASS','No evidence']), /状态已改变/);
    await assert.rejects(() => run(['event','29','21','LOG','bad key','message']), /状态已改变/);
    assert.equal(writes.length, 0);
  });
});

test('checkpoint JSON through stdin survives native shell quoting and enforces size limit', async () => {
  await withMock(async ({ run, writes }) => {
    await run(['start','29','21']);
    await run(['checkpoint','29','21','pipe-1','-'], {
      stdin: Readable.from(['{"step":2,"token":"NOT-FOR-LOGS"}'])
    });
    const entry = writes.find(w => w.body.eventKey === 'pipe-1');
    assert.equal(entry.body.eventType, 'CHECKPOINT');
    assert.equal(JSON.parse(entry.body.eventDataJson).token, '[REDACTED]');
    await assert.rejects(
      () => run(['checkpoint','29','21','pipe-2','-'], {
        stdin: Readable.from(['x'.repeat(51000)])
      }), /50KB/);
    assert.equal(writes.filter(w => w.pathname.endsWith('/events')).length, 1);
  });
});

test('invalid checkpoint and suspicious event key are rejected without posting', async () => {
  await withMock(async ({ run, writes }) => {
    await run(['start','29','21']);
    await assert.rejects(() => run(['checkpoint','29','21','cp-2','not_json']), /JSON/);
    await assert.rejects(() => run(['event','29','21','LOG','../../unsafe','message okay']), /eventKey/);
    await assert.rejects(() => run(['complete','29','21','PASS','bad']), /至少 8/);
    assert.equal(writes.length, 1);
  });
});


test('plan is read-only and returns redacted checkpoint and events for a running attempt', async () => {
  const fixture = makeFixture();
  fixture.task.taskStatus = 'RUNNING';
  fixture.executions[0].executionStatus = 'RUNNING';
  fixture.executions[0].checkpointJson = JSON.stringify({ step: 3, password: 'SHOULD-HIDE' });
  fixture.executions[0].events = [{ eventType: 'STEP_COMPLETED', eventKey: 'step-3',
    eventContent: 'token=SHOULD-HIDE' }];
  await withMock(async ({ run, writes }) => {
    const plan = await run(['plan','29','21']);
    assert.equal(plan.nextAction, 'CONTINUE_RUNNING');
    assert.equal(plan.checkpoint.password, '[REDACTED]');
    assert.equal(JSON.stringify(plan).includes('SHOULD-HIDE'), false);
    assert.equal(writes.length, 0);
    await assert.rejects(() => run(['plan','29','22']), /不匹配/);
  }, fixture);
});

test('plan distinguishes recovered queue, interrupted manual recovery and unsafe states', async () => {
  const fixture = makeFixture();
  fixture.executions[0].id = 22;
  fixture.executions[0].attemptNo = 2;
  fixture.executions[0].checkpointJson = '{"step":4}';
  fixture.executions.push({ id: 21, executionStatus: 'INTERRUPTED' });
  await withMock(async ({ run, replace, writes }) => {
    assert.equal((await run(['plan','29','22'])).nextAction, 'START_RECOVERED');
    const interrupted = structuredClone(fixture);
    interrupted.task.taskStatus = 'RECOVERY_REQUIRED';
    interrupted.executions[0].executionStatus = 'INTERRUPTED';
    replace(interrupted);
    assert.equal((await run(['plan','29','22'])).nextAction, 'MANUAL_RECOVERY');
    interrupted.task.taskStatus = 'WAITING_HUMAN';
    interrupted.executions[0].executionStatus = 'WAITING_HUMAN';
    replace(interrupted);
    assert.equal((await run(['plan','29','22'])).nextAction, 'STOP');
    interrupted.executions[0].checkpointJson = '{broken';
    replace(interrupted);
    await assert.rejects(() => run(['plan','29','22']), /JSON 已损坏/);
    assert.equal(writes.length, 0);
  }, fixture);
});
