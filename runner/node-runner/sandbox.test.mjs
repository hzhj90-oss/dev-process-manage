import test from 'node:test';
import assert from 'node:assert/strict';
import { executeNodeScript } from './sandbox.mjs';

test('runs a fixed entry point with only the documented context and assertion APIs', async () => {
  const result = await executeNodeScript({
    sourceContent: [
      'function main(ctx) {',
      '  console.log("case", ctx.case.caseNo);',
      '  assert.equal(ctx.args.expected, 42, "argument is available");',
      '  assert.equal(typeof process, "undefined", "process is not exposed");',
      '  assert.equal(typeof require, "undefined", "require is not exposed");',
      '  assert.equal(typeof fetch, "undefined", "network is not exposed");',
      '  return { answer: ctx.args.expected };',
      '}'
    ].join('\n'),
    entryPoint: 'main',
    input: { case: { caseNo: 'NODE-001' }, args: { expected: 42 } }
  });

  assert.equal(result.result, 'PASS');
  assert.equal(result.assertions.length, 4);
  assert.equal(result.logs.length, 1);
  assert.deepEqual(result.returnValue, { answer: 42 });
});

test('eval and Function constructors remain inside the guest runtime', async () => {
  const result = await executeNodeScript({
    sourceContent: [
      'function main() {',
      '  assert.equal(Function("return typeof process")(), "undefined");',
      '  assert.equal(eval("typeof require"), "undefined");',
      '  assert.equal(typeof globalThis.fetch, "undefined");',
      '  assert.equal(typeof globalThis.setTimeout, "undefined");',
      '}'
    ].join('\n')
  });
  assert.equal(result.result, 'PASS');
  assert.equal(result.assertions.length, 4);
});

test('returns FAIL when any assertion fails', async () => {
  const result = await executeNodeScript({
    sourceContent: 'function main() { assert.equal(1, 2, "expected failure"); }'
  });
  assert.equal(result.result, 'FAIL');
  assert.equal(result.assertions.length, 1);
  assert.equal(result.assertions[0].passed, false);
});

test('interrupts an infinite loop at the configured deadline', async () => {
  const result = await executeNodeScript({
    sourceContent: 'function main() { while (true) {} }',
    timeoutMs: 100
  });
  assert.equal(result.result, 'BLOCKED');
  assert.match(result.errorMessage, /interrupted/i);
  assert.ok(result.durationMs < 3000);
});

test('blocks scripts that do not record assertions', async () => {
  const result = await executeNodeScript({
    sourceContent: 'function main() { console.log("no assertions"); return 1; }'
  });
  assert.equal(result.result, 'BLOCKED');
  assert.match(result.errorMessage, /without recording any assertions/i);
});

test('rejects a missing entry point', async () => {
  const result = await executeNodeScript({
    sourceContent: 'function run() { assert.ok(true); }',
    entryPoint: 'main'
  });
  assert.equal(result.result, 'FAIL');
  assert.match(result.errorMessage, /not a function/i);
});

test('blocks asynchronous entry points in v1', async () => {
  const result = await executeNodeScript({
    sourceContent: 'async function main() { assert.ok(true); return 1; }'
  });
  assert.equal(result.result, 'BLOCKED');
  assert.match(result.errorMessage, /does not support asynchronous/i);
});

test('enforces source size and entry point identifier limits', async () => {
  await assert.rejects(
    executeNodeScript({ sourceContent: 'x'.repeat(100 * 1024 + 1) }),
    /exceeds 100 KiB/
  );
  await assert.rejects(
    executeNodeScript({ sourceContent: 'function main() {}', entryPoint: 'main()' }),
    /must be a JavaScript identifier/
  );
});

test('freezes the input snapshot before exposing it to the script', async () => {
  const result = await executeNodeScript({
    sourceContent: [
      'function main(ctx) {',
      '  ctx.args.nested.value = 99;',
      '  assert.equal(ctx.args.nested.value, 7);',
      '  assert.ok(Object.isFrozen(ctx.args.nested));',
      '  return { blocked: ctx.args.nested.value === 7 };',
      '}'
    ].join('\n'),
    input: { args: { nested: { value: 7 } } }
  });
  assert.equal(result.result, 'PASS');
  assert.deepEqual(result.returnValue, { blocked: true });
});

test('blocks scripts that exceed the assertion limit', async () => {
  const result = await executeNodeScript({
    sourceContent: 'function main() { for (let i = 0; i < 101; i++) assert.ok(true); }'
  });
  assert.equal(result.result, 'BLOCKED');
  assert.match(result.errorMessage, /100 assertion limit/i);
  assert.equal(result.assertions.length, 100);
});

test('limits guest heap memory', async () => {
  const result = await executeNodeScript({
    sourceContent: 'function main() { const values = new Array(10000000).fill(1); assert.ok(values.length); }',
    memoryLimitBytes: 4 * 1024 * 1024
  });
  assert.equal(result.result, 'BLOCKED');
});
