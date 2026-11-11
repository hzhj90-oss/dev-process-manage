// Browser DSL has no executable JavaScript, shell, filesystem paths or arbitrary URLs.
const ACTIONS = new Set(['GOTO', 'CLICK', 'FILL', 'PRESS', 'ASSERT_VISIBLE',
  'ASSERT_TEXT', 'ASSERT_TITLE', 'WAIT_VISIBLE', 'SCREENSHOT']);
const PER_STEP_KEYS = {
  GOTO: ['action', 'path'], CLICK: ['action', 'selector'],
  FILL: ['action', 'selector', 'value'],
  PRESS: ['action', 'selector', 'key'],
  ASSERT_VISIBLE: ['action', 'selector'],
  ASSERT_TEXT: ['action', 'selector', 'expected'],
  ASSERT_TITLE: ['action', 'expected'],
  WAIT_VISIBLE: ['action', 'selector'],
  SCREENSHOT: ['action', 'name']
};
const SAFE_KEYS = new Set(['Enter', 'Tab', 'Escape', 'Backspace', 'ArrowUp',
  'ArrowDown', 'ArrowLeft', 'ArrowRight']);

function object(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function exactKeys(value, allowed) {
  return Object.keys(value).every(key => allowed.includes(key));
}
function text(value, limit) {
  return typeof value === 'string' && value.length > 0 && value.length <= limit;
}
function safePath(path) {
  if (!text(path, 512) || !path.startsWith('/') || path.startsWith('//')
    || path.includes('\\') || path.includes('%') || /[\u0000-\u001f]/.test(path)) return false;
  const pathname = path.split(/[?#]/, 1)[0];
  return !pathname.split('/').some(segment => segment === '.' || segment === '..');
}
function validateStep(step) {
  if (!object(step) || !ACTIONS.has(step.action)
    || !exactKeys(step, PER_STEP_KEYS[step.action])) throw Error('Unsupported browser step or field');
  if (step.action === 'GOTO' && !safePath(step.path)) throw Error('Unsafe browser navigation path');
  if (['CLICK','FILL','PRESS','ASSERT_VISIBLE','ASSERT_TEXT','WAIT_VISIBLE'].includes(step.action)
    && (!text(step.selector, 250) || /[\u0000-\u001f]/.test(step.selector))) {
    throw Error('Browser step requires a valid CSS selector');
  }
  if (step.action === 'FILL' && (typeof step.value !== 'string' || step.value.length > 500))
    throw Error('FILL value must be a string with up to 500 characters');
  if (step.action === 'PRESS' && !SAFE_KEYS.has(step.key))
    throw Error('Unsupported browser key');
  if (['ASSERT_TEXT','ASSERT_TITLE'].includes(step.action) && !text(step.expected, 250))
    throw Error('Text assertion requires expected text');
  if (step.action === 'SCREENSHOT'
    && (!text(step.name, 64) || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}\.png$/.test(step.name)))
    throw Error('Screenshot name must be a safe .png filename');
}
export function validateBrowserDsl(source) {
  if (typeof source !== 'string' || Buffer.byteLength(source, 'utf8') > 32 * 1024)
    throw Error('Browser script must be a JSON string of at most 32 KB');
  let value;
  try { value = JSON.parse(source); } catch { throw Error('Browser script must contain valid JSON'); }
  if (!object(value) || !exactKeys(value, ['version','timeoutMs','steps'])
    || value.version !== 1 || !Array.isArray(value.steps)
    || value.steps.length < 1 || value.steps.length > 30)
    throw Error('Browser DSL requires version 1 and 1-30 steps');
  const timeoutMs = value.timeoutMs ?? 30000;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 60000)
    throw Error('Browser timeoutMs must be 1000-60000');
  let screenshotCount = 0;
  let assertionCount = 0;
  for (const step of value.steps) {
    if (step.action.startsWith('ASSERT_')) assertionCount++;
    validateStep(step);
    if (step.action === 'SCREENSHOT' && ++screenshotCount > 3)
      throw Error('A browser script may capture at most 3 screenshots');
  }
  if (value.steps[0].action !== 'GOTO') throw Error('The first browser step must be GOTO');
  if (assertionCount === 0) throw Error('Browser DSL requires at least one assertion');
  return { version: 1, timeoutMs, steps: value.steps };
}
export function browserTargetUrl(baseUrl, path) {
  if (!text(baseUrl, 1000)) throw Error('Test environment baseUrl is missing');
  let base;
  try { base = new URL(baseUrl); } catch { throw Error('Invalid test environment baseUrl'); }
  if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password)
    throw Error('Browser environment requires a credential-free http(s) baseUrl');
  if (base.search || base.hash || base.pathname !== '/' && base.pathname !== '')
    throw Error('Browser baseUrl must contain only the origin');
  if (!safePath(path)) throw Error('Unsafe browser navigation path');
  const target = new URL(path, base.origin);
  if (target.origin !== base.origin) throw Error('Cross-origin browser navigation is forbidden');
  return target;
}

