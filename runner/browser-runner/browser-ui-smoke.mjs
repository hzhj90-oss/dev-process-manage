// Read-only check that the script editor exposes the new BROWSER language.
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
const browser = await chromium.launch({
  executablePath: process.env.DPM_CHROME_PATH,
  headless: true,
  args: ['--disable-extensions', '--no-first-run']
});
try {
  const context = await browser.newContext({ serviceWorkers: 'block' });
  const page = await context.newPage();
  await page.goto('http://127.0.0.1:18090/#/test-scripts', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: '新建脚本' }).click();
  const dialog = page.locator('.el-dialog:visible');
  await dialog.getByText('脚本语言').waitFor({ state: 'visible' });
  const language = dialog.locator('.el-form-item').filter({ hasText: '脚本语言' });
  await language.locator('.el-select').click();
  await page.getByText('Browser / Playwright', { exact: true }).last().click();
  assert.match(await language.innerText(), /Browser \/ Playwright/);
  console.log('BROWSER_UI_SMOKE_PASS script language selectable');
  await context.close();
} finally {
  await browser.close();
}
