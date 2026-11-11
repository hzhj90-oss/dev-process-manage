import { chromium } from 'playwright-core';
import { browserTargetUrl, validateBrowserDsl } from './browser-dsl.mjs';

// This is a constrained browser automation driver, not an OS container.
// Only run against explicitly authorized, non-production test origins.
export async function executeBrowserScript({ source, environment, chromePath, onStep, onScreenshot, shouldAbort }) {
  const dsl = validateBrowserDsl(source);
  if (String(environment?.environmentType ?? '').toUpperCase() === 'PROD')
    throw Error('Production browser automation is disabled');
  if (String(environment?.authType ?? 'NONE').toUpperCase() !== 'NONE')
    throw Error('Browser Runner v1 only supports NONE authentication');
  const target = browserTargetUrl(environment?.baseUrl, dsl.steps[0].path);
  const origin = target.origin;
  const allowedOrigins = (process.env.DPM_BROWSER_ALLOWED_ORIGINS || 'http://127.0.0.1:18090')
    .split(',').map(value => value.trim()).filter(Boolean);
  if (!allowedOrigins.includes(origin))
    throw Error('Browser origin is not on the runner administrator allowlist');
  if (!chromePath || !/chrome\.exe$/i.test(chromePath))
    throw Error('Chrome executable path must be explicitly configured');
  const browser = await chromium.launch({
    executablePath: chromePath, headless: true,
    args: ['--disable-extensions', '--no-first-run', '--no-default-browser-check']
  });
  let context;
  const logs = [];
  let passedAssertions = 0;
  let screenshots = 0;
  let deadlineTimer;
  try {
    deadlineTimer = setTimeout(() => context?.close().catch(() => {}), dsl.timeoutMs);
    context = await browser.newContext({
      viewport: { width: 1280, height: 800 }, serviceWorkers: 'block',
      acceptDownloads: false, permissions: [], ignoreHTTPSErrors: false,
      javaScriptEnabled: true
    });
    await context.route('**/*', async route => {
      let permitted = false;
      try {
        const address = new URL(route.request().url());
        permitted = (address.protocol === 'http:' || address.protocol === 'https:')
          && address.origin === origin;
      } catch { /* refuse unknown protocols */ }
      try { if (permitted) await route.continue(); else await route.abort('blockedbyclient'); }
      catch { /* request may have ended during shutdown */ }
    });
    if (typeof context.routeWebSocket === 'function') {
      await context.routeWebSocket('**/*', websocket => websocket.close());
    }
    const page = await context.newPage();
    page.on('popup', popup => popup.close().catch(() => {}));
    page.setDefaultTimeout(5000);
    page.setDefaultNavigationTimeout(10000);
    const start = Date.now();
    for (let index = 0; index < dsl.steps.length; index++) {
      if (shouldAbort?.()) throw Error('Browser execution cancelled or lease lost');
      if (Date.now() - start > dsl.timeoutMs) throw Error('Browser task exceeded its deadline');
      const step = dsl.steps[index];
      const locator = step.selector ? page.locator(step.selector).first() : null;
      if (step.action === 'GOTO') {
        await page.goto(browserTargetUrl(environment.baseUrl, step.path).href, { waitUntil: 'domcontentloaded' });
      } else if (step.action === 'CLICK') {
        await locator.click();
      } else if (step.action === 'FILL') {
        await locator.fill(step.value); // Never log input values.
      } else if (step.action === 'PRESS') {
        await locator.press(step.key);
      } else if (step.action === 'WAIT_VISIBLE' || step.action === 'ASSERT_VISIBLE') {
        await locator.waitFor({ state: 'visible' });
        if (step.action === 'ASSERT_VISIBLE') passedAssertions++;
      } else if (step.action === 'ASSERT_TEXT') {
        const value = await locator.innerText();
        if (!value.includes(step.expected)) throw Error('ASSERTION_FAILED: expected text not found in selected element');
        passedAssertions++;
      } else if (step.action === 'ASSERT_TITLE') {
        const title = await page.title();
        if (!title.includes(step.expected)) throw Error('ASSERTION_FAILED: expected page title not found');
        passedAssertions++;
      } else if (step.action === 'SCREENSHOT') {
        const buffer = await page.screenshot({ type: 'png', animations: 'disabled' });
        if (buffer.length > 5 * 1024 * 1024) throw Error('Screenshot exceeds 5 MB limit');
        screenshots++;
        if (onScreenshot) await onScreenshot(step.name, buffer);
      }
      const visibleStep = step.action === 'FILL'
        ? { action: 'FILL', selector: step.selector } : step;
      if (shouldAbort?.()) throw Error('Browser execution cancelled or lease lost');
      logs.push('Step ' + (index + 1) + ': ' + visibleStep.action + ' OK');
      if (onStep) await onStep(index, visibleStep);
      if (new URL(page.url()).origin !== origin)
        throw Error('Browser left its allowed origin');
    }
    if (passedAssertions === 0) throw Error('Browser DSL must execute at least one assertion');
    return { result: 'PASS', passedAssertions, screenshots, logs };
  } finally {
    clearTimeout(deadlineTimer);
    if (context) await context.close().catch(() => {});
    await browser.close().catch(() => {});
  }
}
