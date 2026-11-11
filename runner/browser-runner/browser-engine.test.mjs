import test from 'node:test';
import assert from 'node:assert/strict';
import { executeBrowserScript } from './browser-engine.mjs';

const source = JSON.stringify({ version: 1, steps: [
  { action: 'GOTO', path: '/' },
  { action: 'ASSERT_VISIBLE', selector: 'h1' }
] });
const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
test('rejects production browser automation before launching Chrome', async () => {
  await assert.rejects(executeBrowserScript({ source, chromePath,
    environment: { baseUrl: 'http://127.0.0.1:18090', environmentType: 'PROD', authType: 'NONE' }
  }), /Production browser automation is disabled/);
});
test('rejects authenticated environment without credential support', async () => {
  await assert.rejects(executeBrowserScript({ source, chromePath,
    environment: { baseUrl: 'http://127.0.0.1:18090', environmentType: 'TEST', authType: 'TOKEN' }
  }), /only supports NONE authentication/);
});
test('refuses arbitrary environment origins without administrator approval', async () => {
  await assert.rejects(executeBrowserScript({ source, chromePath,
    environment: { baseUrl: 'http://169.254.169.254', environmentType: 'TEST', authType: 'NONE' }
  }), /administrator allowlist/);
});
test('refuses an absent executable path', async () => {
  await assert.rejects(executeBrowserScript({ source,
    environment: { baseUrl: 'http://127.0.0.1:18090', environmentType: 'TEST', authType: 'NONE' }
  }), /Chrome executable path/);
});
