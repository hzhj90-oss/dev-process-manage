import { getQuickJS } from 'quickjs-emscripten';
import { isDeepStrictEqual } from 'node:util';

const MAX_SOURCE_BYTES = 100 * 1024;
const MAX_CONTEXT_BYTES = 256 * 1024;
const MAX_LOG_ENTRIES = 200;
const MAX_LOG_CHARS = 10000;
const MAX_ASSERTIONS = 100;

function asText(value) {
  if (typeof value === 'string') return value;
  try { return JSON.stringify(value); }
  catch { return String(value); }
}

function safeJsonValue(value) {
  try {
    const json = JSON.stringify(value, (_key, item) =>
      typeof item === 'bigint' ? item.toString() : item);
    if (json === undefined) return null;
    if (json.length > 4000) return { truncated: true, preview: json.slice(0, 4000) };
    return JSON.parse(json);
  } catch {
    return String(value).slice(0, 4000);
  }
}

function errorText(value) {
  if (value && typeof value === 'object') {
    const name = value.name || 'Error';
    const message = value.message || asText(value);
    return (name + ': ' + message).slice(0, 2000);
  }
  return String(value ?? 'Unknown QuickJS error').slice(0, 2000);
}

function deepFreezeSource(jsonLiteral) {
  return 'globalThis.__dpmInput = JSON.parse(' + jsonLiteral + ');'
    + '(function freeze(value) {'
    + ' if (value && typeof value === "object" && !Object.isFrozen(value)) {'
    + '  Object.freeze(value); Object.keys(value).forEach(function(key) { freeze(value[key]); });'
    + ' } return value;'
    + '})(globalThis.__dpmInput);';
}

export async function executeNodeScript({
  sourceContent,
  entryPoint = 'main',
  input = {},
  timeoutMs = 5000,
  memoryLimitBytes = 32 * 1024 * 1024,
  maxStackSizeBytes = 512 * 1024
} = {}) {
  if (typeof sourceContent !== 'string' || !sourceContent.trim()) {
    throw new Error('Node script source is empty');
  }
  if (Buffer.byteLength(sourceContent, 'utf8') > MAX_SOURCE_BYTES) {
    throw new Error('Node script source exceeds 100 KiB');
  }
  if (!/^[A-Za-z_$][A-Za-z0-9_$]{0,63}$/.test(entryPoint)) {
    throw new Error('Node script entryPoint must be a JavaScript identifier');
  }
  if (!Number.isInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 10000) {
    throw new Error('Node script timeout must be between 100 and 10000 ms');
  }

  const inputJson = JSON.stringify(input ?? {});
  if (Buffer.byteLength(inputJson, 'utf8') > MAX_CONTEXT_BYTES) {
    throw new Error('Node script input context exceeds 256 KiB');
  }

  const logs = [];
  const assertions = [];
  let assertionLimitExceeded = false;
  let logChars = 0;
  const startedAt = Date.now();
  const deadline = startedAt + timeoutMs;
  const QuickJS = await getQuickJS();
  const runtime = QuickJS.newRuntime();
  runtime.setMemoryLimit(memoryLimitBytes);
  runtime.setMaxStackSize(maxStackSizeBytes);
  runtime.setInterruptHandler(() => Date.now() >= deadline);
  const vm = runtime.newContext();

  const addConsoleMethod = (consoleObject, methodName) => {
    const fn = vm.newFunction('console.' + methodName, (...args) => {
      if (logs.length >= MAX_LOG_ENTRIES || logChars >= MAX_LOG_CHARS) {
        return vm.undefined;
      }
      const message = args.map((arg) => {
        const dumped = vm.dump(arg);
        return typeof dumped === 'string' ? dumped : asText(dumped);
      }).join(' ');
      const remaining = MAX_LOG_CHARS - logChars;
      const text = message.slice(0, Math.max(remaining, 0));
      logs.push({ level: methodName, message: text });
      logChars += text.length;
      return vm.undefined;
    });
    vm.setProp(consoleObject, methodName, fn);
    fn.dispose();
  };

  const recordAssertion = (type, actual, expected, passed, description) => {
    if (assertions.length >= MAX_ASSERTIONS) {
      assertionLimitExceeded = true;
      return vm.false;
    }
    assertions.push({
      type,
      actual: safeJsonValue(actual),
      expected: safeJsonValue(expected),
      passed: Boolean(passed),
      description: String(description || type).slice(0, 500)
    });
    return passed ? vm.true : vm.false;
  };

  const addAssertionMethod = (assertObject, name, evaluator) => {
    const fn = vm.newFunction('assert.' + name, (...args) => {
      const actual = args.length > 0 ? vm.dump(args[0]) : undefined;
      const expected = args.length > 1 ? vm.dump(args[1]) : undefined;
      const description = args.length > (name === 'ok' || name === 'exists' ? 1 : 2)
        ? vm.getString(args[name === 'ok' || name === 'exists' ? 1 : 2])
        : name;
      return recordAssertion(name, actual, expected,
        evaluator(actual, expected), description);
    });
    vm.setProp(assertObject, name, fn);
    fn.dispose();
  };

  try {
    const consoleObject = vm.newObject();
    for (const method of ['log', 'info', 'warn', 'error']) {
      addConsoleMethod(consoleObject, method);
    }
    vm.setProp(vm.global, 'console', consoleObject);
    consoleObject.dispose();

    const assertObject = vm.newObject();
    addAssertionMethod(assertObject, 'equal',
      (actual, expected) => isDeepStrictEqual(actual, expected));
    addAssertionMethod(assertObject, 'deepEqual',
      (actual, expected) => isDeepStrictEqual(actual, expected));
    addAssertionMethod(assertObject, 'ok',
      (actual) => Boolean(actual));
    addAssertionMethod(assertObject, 'exists',
      (actual) => actual !== undefined && actual !== null);
    addAssertionMethod(assertObject, 'contains', (actual, expected) => {
      if (typeof actual === 'string') return actual.includes(String(expected));
      if (Array.isArray(actual)) return actual.some(item => isDeepStrictEqual(item, expected));
      return false;
    });
    vm.setProp(vm.global, 'assert', assertObject);
    assertObject.dispose();

    const setup = vm.evalCode(deepFreezeSource(JSON.stringify(inputJson)));
    if (setup.error) {
      const message = errorText(vm.dump(setup.error));
      setup.error.dispose();
      return {
        result: 'BLOCKED', errorMessage: message, logs, assertions,
        durationMs: Date.now() - startedAt, returnValue: null
      };
    }
    setup.value.dispose();

    const evaluated = vm.evalCode(sourceContent, 'test-script.js');
    if (evaluated.error) {
      const message = errorText(vm.dump(evaluated.error));
      evaluated.error.dispose();
      const timedOut = /interrupted|out of memory/i.test(message);
      return {
        result: timedOut ? 'BLOCKED' : 'FAIL',
        errorMessage: message, logs, assertions,
        durationMs: Date.now() - startedAt, returnValue: null
      };
    }
    evaluated.value.dispose();

    const entry = vm.getProp(vm.global, entryPoint);
    if (vm.typeof(entry) !== 'function') {
      entry.dispose();
      return {
        result: 'FAIL',
        errorMessage: 'Entry point "' + entryPoint + '" is not a function',
        logs, assertions, durationMs: Date.now() - startedAt, returnValue: null
      };
    }

    const context = vm.getProp(vm.global, '__dpmInput');
    const called = vm.callFunction(entry, vm.undefined, context);
    context.dispose();
    entry.dispose();

    if (called.error) {
      const message = errorText(vm.dump(called.error));
      called.error.dispose();
      const timedOut = /interrupted|out of memory/i.test(message);
      return {
        result: timedOut ? 'BLOCKED' : 'FAIL',
        errorMessage: message, logs, assertions,
        durationMs: Date.now() - startedAt, returnValue: null
      };
    }

    let isThenable = false;
    const returnType = vm.typeof(called.value);
    if (returnType === 'object' || returnType === 'function') {
      const then = vm.getProp(called.value, 'then');
      isThenable = vm.typeof(then) === 'function';
      then.dispose();
    }
    if (isThenable) {
      called.value.dispose();
      return {
        result: 'BLOCKED',
        errorMessage: 'Node Runner v1 does not support asynchronous entry points',
        logs, assertions, durationMs: Date.now() - startedAt, returnValue: null
      };
    }

    const returnValue = safeJsonValue(vm.dump(called.value));
    called.value.dispose();
    const result = assertionLimitExceeded ? 'BLOCKED' : assertions.length === 0 ? 'BLOCKED'
      : assertions.every(item => item.passed) ? 'PASS' : 'FAIL';
    const errorMessage = assertionLimitExceeded ? 'Script exceeded the 100 assertion limit'
      : assertions.length === 0 ? 'Script completed without recording any assertions' : null;
    return {
      result, errorMessage, logs, assertions,
      durationMs: Date.now() - startedAt, returnValue
    };
  } finally {
    vm.dispose();
    runtime.dispose();
  }
}
