import test from 'node:test';
import assert from 'node:assert/strict';
import { validateBrowserDsl, browserTargetUrl } from './browser-dsl.mjs';
const sample = JSON.stringify({ version: 1, steps: [
  { action: 'GOTO', path: '/#/test-reports' },
  { action: 'ASSERT_VISIBLE', selector: 'h1' },
  { action: 'ASSERT_TEXT', selector: 'h1', expected: '报告' },
  { action: 'SCREENSHOT', name: 'report.png' }
] });
test('validates a real read-only browser workflow', () => {
  const result = validateBrowserDsl(sample);
  assert.equal(result.steps.length, 4);
  assert.equal(result.timeoutMs, 30000);
});
test('rejects absolute and protocol-relative navigation', () => {
  for (const path of ['https://evil.example', '//evil.example/', '/../secret',
    '/%2e%2e/secret', '/safe\\evil']) {
    assert.throws(() => validateBrowserDsl(JSON.stringify({ version: 1,
      steps: [{ action: 'GOTO', path }] })));
  }
});
test('rejects unknown actions and executable fields', () => {
  for (const step of [{ action: 'EVAL', code: 'process.exit(0)' },
    { action: 'GOTO', path: '/', evaluate: '1+1' }]) {
    assert.throws(() => validateBrowserDsl(JSON.stringify({ version: 1, steps: [step] })));
  }
});
test('requires an executable assertion rather than only actions', () => {
  assert.throws(() => validateBrowserDsl(JSON.stringify({ version: 1,
    steps: [{ action: 'GOTO', path: '/' }, { action: 'SCREENSHOT', name: 'no-assert.png' }] })));
});
test('requires first step to navigate', () => {
  assert.throws(() => validateBrowserDsl(JSON.stringify({ version: 1,
    steps: [{ action: 'SCREENSHOT', name: 'test.png' }] })));
});
test('limits steps, screenshots and total deadline', () => {
  assert.throws(() => validateBrowserDsl(JSON.stringify({ version: 1,
    steps: Array(31).fill({ action: 'GOTO', path: '/' }) })));
  assert.throws(() => validateBrowserDsl(JSON.stringify({ version: 1,
    steps: [{ action: 'GOTO', path: '/' }, ...Array(4).fill({ action: 'SCREENSHOT', name: 'a.png' })] })));
  assert.throws(() => validateBrowserDsl(JSON.stringify({ version: 1, timeoutMs: 999999,
    steps: [{ action: 'GOTO', path: '/' }] })));
});
test('rejects arbitrary key combinations and dangerous screen paths', () => {
  assert.throws(() => validateBrowserDsl(JSON.stringify({ version: 1,
    steps: [{ action: 'GOTO', path: '/' }, { action: 'PRESS', selector: 'input', key: 'Control+O' }] })));
  assert.throws(() => validateBrowserDsl(JSON.stringify({ version: 1,
    steps: [{ action: 'GOTO', path: '/' }, { action: 'SCREENSHOT', name: '../p.png' }] })));
});
test('pins every URL to the environment origin', () => {
  assert.equal(browserTargetUrl('http://127.0.0.1:18090', '/#/test-reports').href,
    'http://127.0.0.1:18090/#/test-reports');
  for (const base of ['file:///C:/secret', 'http://user:pass@localhost/', 'https://site/a/',
    'http://localhost/?token=x']) assert.throws(() => browserTargetUrl(base, '/'));
});

