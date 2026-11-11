// Non-mutating Chrome regression: assertion failures produce evidence and FAIL semantics.
import assert from 'node:assert/strict';
import { executeBrowserScript } from './browser-engine.mjs';
const environment = { baseUrl: 'http://127.0.0.1:18090', environmentType: 'TEST', authType: 'NONE' };
const chromePath = process.env.DPM_CHROME_PATH;
for (const assertion of [
  { action: 'ASSERT_TEXT', selector: 'h1', expected: 'intentionally-missing-text' },
  { action: 'ASSERT_VISIBLE', selector: '#intentionally-missing-element' }
]) {
  const screenshots = [];
  const source = JSON.stringify({ version: 1, timeoutMs: 15000, steps: [
    { action: 'GOTO', path: '/#/test-reports' }, assertion
  ] });
  await assert.rejects(executeBrowserScript({ source, environment, chromePath,
    onScreenshot: async (name, bytes) => screenshots.push({ name, bytes })
  }), /ASSERTION_FAILED:/);
  assert.equal(screenshots.length, 1, 'Expected an automatic failure screenshot');
  assert.equal(screenshots[0].name, 'browser-failure.png');
  assert.equal(Buffer.from(screenshots[0].bytes).subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
}
console.log('BROWSER_FAILURE_EVIDENCE_PASS cases=2 automatic-screenshots=2');
