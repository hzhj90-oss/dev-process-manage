// Real Chrome, GET-only: project -> version -> requirement / cycle context navigation.
// Uses existing tagged local verification data, never creates tasks or writes database rows.
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';

const origin = 'http://127.0.0.1:18090';
const get = async (path) => {
  const response = await fetch(origin + path, { signal: AbortSignal.timeout(12000) });
  assert.equal(response.status, 200, path);
  return response.json();
};
const projects = await get('/api/projects?pageNum=1&pageSize=100');
const project = projects.list.find(row => row.projectCode?.startsWith('DPM-VERIFY-FLOW-'));
assert.ok(project, 'No tagged verification project; run the opt-in business-flow E2E first');
const versions = await get('/api/versions?projectId=' + project.id + '&pageNum=1&pageSize=100');
const version = versions.list.find(row => row.projectId === project.id);
assert.ok(version, 'Tagged verification project has no version');
const requirements = await get('/api/requirements?versionId=' + version.id + '&pageNum=1&pageSize=100');
const requirement = requirements.list[0];
assert.ok(requirement, 'Tagged verification version has no requirement');

const browser = await chromium.launch({
  executablePath: process.env.DPM_CHROME_PATH,
  headless: true, args: ['--disable-extensions', '--no-first-run']
});
try {
  const context = await browser.newContext({ serviceWorkers: 'block' });
  const page = await context.newPage();
  let writes = 0;
  let exceptions = 0;
  page.on('request', req => {
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method())) writes++;
  });
  page.on('pageerror', () => exceptions++);

  async function waitRoute(prefix, key, value) {
    try {
      await page.waitForFunction(({ prefix, key, value }) => {
        const [path, query] = location.hash.slice(1).split('?');
        return path === prefix && new URLSearchParams(query).get(key) === String(value);
      }, { prefix, key, value }, { timeout: 13000 });
    } catch (error) {
      console.error('CONTEXT_ROUTE_TIMEOUT expected=' + prefix + '?' + key + '=' + value
        + ' actual=' + await page.evaluate(() => location.hash)
        + ' errors=' + exceptions);
      throw error;
    }
  }
  async function tableHas(text) {
    await page.locator('.el-table__body tr').filter({ hasText: text })
      .first().waitFor({ state: 'visible', timeout: 16000 });
  }
  async function selectedFormVersion(label) {
    const dialog = page.locator('.el-dialog:visible').last();
    // Under the full browser suite the paginated project/version options
    // may finish loading after the modal becomes visible. Wait for the
    // actual selected label, not merely for the outer dialog element.
    await dialog.getByText(label, { exact: false }).first()
      .waitFor({ state: 'visible', timeout: 20000 });
    return dialog;
  }

  await page.goto(origin + '/#/projects', { waitUntil: 'domcontentloaded' });
  await tableHas(project.projectCode);
  const projectRow = page.locator('.el-table__body tr')
    .filter({ hasText: project.projectCode }).first();
  await projectRow.getByRole('button', { name: '查看版本' }).click();
  await waitRoute('/versions', 'projectId', project.id);
  await tableHas(version.versionNo);
  const versionRow = page.locator('.el-table__body tr')
    .filter({ hasText: version.versionNo }).first();

  // Creating a version from the selected project inherits the project.
  await page.getByRole('button', { name: '新增版本' }).click();
  let dialog = await selectedFormVersion(project.projectCode);
  assert.ok((await dialog.innerText()).includes(project.projectCode));
  await dialog.getByRole('button', { name: '取消' }).click();
  await dialog.waitFor({ state: 'hidden', timeout: 8000 });

  await versionRow.getByRole('button', { name: '查看需求' }).click();
  await waitRoute('/requirements', 'versionId', version.id);
  await tableHas(requirement.requirementNo);
  const reqRows = page.locator('.el-table__body tr');
  assert.equal(await reqRows.count(), requirements.list.length,
    'Version link must apply the selected requirement filter');
  await page.getByRole('button', { name: '新增需求' }).click();
  dialog = await selectedFormVersion(version.versionNo);
  assert.ok((await dialog.innerText()).includes(version.versionNo));
  await dialog.getByRole('button', { name: '取消' }).click();
  await dialog.waitFor({ state: 'hidden', timeout: 8000 });

  await page.goto(origin + '/#/versions?projectId=' + project.id,
    { waitUntil: 'domcontentloaded' });
  await tableHas(version.versionNo);
  await page.locator('.el-table__body tr').filter({ hasText: version.versionNo })
    .first().getByRole('button', { name: '测试轮次' }).click();
  await waitRoute('/test-cycles', 'versionId', version.id);
  await tableHas(version.versionNo);
  await page.getByRole('button', { name: '新建测试轮次' }).click();
  dialog = await selectedFormVersion(version.versionNo);
  assert.ok((await dialog.innerText()).includes(version.versionNo));
  await dialog.getByRole('button', { name: '取消' }).click();
  await dialog.waitFor({ state: 'hidden', timeout: 8000 });

  // Malformed IDs must not be coerced into a project filter (reused route).
  await page.goto(origin + '/#/versions?projectId=' + project.id,
    { waitUntil: 'domcontentloaded' });
  await tableHas(version.versionNo);
  await page.evaluate(() => { location.hash = '#/versions?projectId=06'; });
  await page.waitForFunction(() =>
    document.querySelector('.muted-count')?.textContent?.includes('共 ')
  );
  const allVersions = await get('/api/versions?pageNum=1&pageSize=10');
  await page.waitForFunction(total =>
    document.querySelector('.muted-count')?.textContent?.includes('共 ' + total),
    allVersions.total, { timeout: 12000 });
  assert.ok(allVersions.total > versions.total);

  assert.equal(exceptions, 0, 'Context navigation must not cause Vue runtime errors');
  assert.equal(writes, 0, 'All contextual navigation and form inspection must be GET-only');
  console.log('BROWSER_CONTEXT_NAV_PASS project=' + project.id
    + ' version=' + version.id + ' requirement=' + requirement.id
    + ' invalidQueryRejected=true writes=' + writes);
  await context.close();
} finally {
  await browser.close();
}
