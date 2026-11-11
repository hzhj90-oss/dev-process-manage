// Non-destructive local browser smoke test; does not change the database.
import assert from 'node:assert/strict';
import { executeBrowserScript } from './browser-engine.mjs';
const chromePath = process.env.DPM_CHROME_PATH;
const managerUrl = process.env.DPM_MANAGER_URL || 'http://127.0.0.1:18090';
let screenshotCount = 0;
const source = JSON.stringify({ version: 1, timeoutMs: 30000, steps: [
  { action: 'GOTO', path: '/#/test-reports' },
  { action: 'WAIT_VISIBLE', selector: 'h1' },
  { action: 'ASSERT_VISIBLE', selector: 'h1' },
  { action: 'ASSERT_TEXT', selector: 'h1', expected: '测试报告' },
  { action: 'FILL', selector: '.filter-keyword input', value: 'browser-runner-no-match-xyz' },
  { action: 'PRESS', selector: '.filter-keyword input', key: 'Enter' },
  { action: 'WAIT_VISIBLE', selector: '.el-table__empty-block' },
  { action: 'ASSERT_VISIBLE', selector: '.el-table__empty-block' },
  { action: 'CLICK', selector: '.filter-row button:has-text("重置")' },
  { action: 'WAIT_VISIBLE', selector: '.el-table__row' },
  { action: 'ASSERT_VISIBLE', selector: '.el-table__row' },
  { action: 'SCREENSHOT', name: 'report-smoke.png' }
] });
const response = await executeBrowserScript({
  source, environment: { baseUrl: managerUrl, environmentType: 'DEV', authType: 'NONE' },
  chromePath,
  onScreenshot: async (name, buffer) => {
    assert.equal(name, 'report-smoke.png');
    assert.equal(Buffer.from(buffer).subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
    screenshotCount++;
  }
});
assert.equal(response.result, 'PASS');
assert.equal(response.passedAssertions, 4);
assert.equal(screenshotCount, 1);
console.log('BROWSER_SMOKE_PASS assertions=4 screenshots=1 steps=' + response.logs.length);
