import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildTargetUrl, evaluateAssertions, resolveJsonPath, validateHttpDsl
} from './http-dsl.mjs';

const validDsl = {
  version: 1,
  request: { base: 'API', method: 'GET', path: '/health' },
  assertions: [{ type: 'STATUS_EQUALS', expected: 200 }]
};

test('accepts a read-only HTTP DSL', () => {
  const result = validateHttpDsl(validDsl);
  assert.equal(result.request.method, 'GET');
  assert.equal(result.request.timeoutMs, 10000);
});

test('rejects write methods and request bodies', () => {
  assert.throws(() => validateHttpDsl({ ...validDsl, request: { ...validDsl.request, method: 'POST' } }));
  assert.throws(() => validateHttpDsl({ ...validDsl, request: { ...validDsl.request, body: {} } }));
});
test('rejects absolute URLs, traversal and encoded separators', () => {
  for (const path of ['https://example.com/a', '//example.com/a', '/../admin', '/%2e%2e/admin', '/a%2fb']) {
    assert.throws(() => validateHttpDsl({ ...validDsl, request: { ...validDsl.request, path } }));
  }
});

test('rejects credentials in headers and query parameters', () => {
  assert.throws(() => validateHttpDsl({ ...validDsl,
    request: { ...validDsl.request, headers: { 'X-Api-Key': 'secret' } } }));
  assert.throws(() => validateHttpDsl({ ...validDsl,
    request: { ...validDsl.request, query: { access_token: 'secret' } } }));
});

test('preserves environment base path and safely encodes query values', () => {
  const url = buildTargetUrl({ apiBaseUrl: 'https://example.test/v1', baseUrl: 'https://example.test' }, {
    base: 'API', path: '/health/check', query: { q: 'hello world', active: true }
  });
  assert.equal(url.href, 'https://example.test/v1/health/check?q=hello+world&active=true');
});
test('resolves nested JSON properties and array indexes', () => {
  const data = { data: { items: [{ id: 17 }, { id: 29 }] } };
  assert.deepEqual(resolveJsonPath(data, '$.data.items[1].id'), { found: true, value: 29 });
  assert.equal(resolveJsonPath(data, '$.data.missing').found, false);
});

test('evaluates status, header, body and JSON assertions', () => {
  const headers = new Headers({ 'content-type': 'application/json', 'x-build': '42' });
  const response = {
    status: 200, headers, bodyText: '{"status":"UP","items":[{"id":7}]}',
    jsonAvailable: true, json: { status: 'UP', items: [{ id: 7 }] }
  };
  const results = evaluateAssertions([
    { type: 'STATUS_EQUALS', expected: 200 },
    { type: 'HEADER_EQUALS', name: 'x-build', expected: '42' },
    { type: 'BODY_CONTAINS', expected: 'UP' },
    { type: 'JSON_PATH_EQUALS', path: '$.items[0].id', expected: 7 },
    { type: 'JSON_PATH_EXISTS', path: '$.status' }
  ], response);
  assert.equal(results.every(item => item.passed), true);
});
