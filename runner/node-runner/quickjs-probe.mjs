import { getQuickJS } from 'quickjs-emscripten';

const QuickJS = await getQuickJS();
const runtime = QuickJS.newRuntime();
runtime.setMemoryLimit(16 * 1024 * 1024);
runtime.setMaxStackSize(512 * 1024);
const deadline = Date.now() + 1000;
runtime.setInterruptHandler(() => Date.now() > deadline);
const vm = runtime.newContext();
const consoleObject = vm.newObject();
const log = vm.newFunction('log', (...args) => {
  process.stdout.write(args.map(arg => JSON.stringify(vm.dump(arg))).join(' ') + '\n');
  return vm.undefined;
});
vm.setProp(consoleObject, 'log', log);
log.dispose();
vm.setProp(vm.global, 'console', consoleObject);
consoleObject.dispose();
const assertObject = vm.newObject();
const equal = vm.newFunction('equal', (actual, expected) => {
  const pass = vm.dump(actual) === vm.dump(expected);
  return pass ? vm.true : vm.false;
});
vm.setProp(assertObject, 'equal', equal);
equal.dispose();
vm.setProp(vm.global, 'assert', assertObject);
assertObject.dispose();

const setup = vm.evalCode("globalThis.context = Object.freeze(JSON.parse('{\"name\":\"runner\"}'));");
if (setup.error) throw new Error(JSON.stringify(vm.dump(setup.error)));
setup.value.dispose();
const evaluated = vm.evalCode('function main(ctx) { console.log("hello", ctx.name); assert.equal(1, 1); return {ok:true}; }');
if (evaluated.error) throw new Error(JSON.stringify(vm.dump(evaluated.error)));
evaluated.value.dispose();
const fn = vm.getProp(vm.global, 'main');
const input = vm.getProp(vm.global, 'context');
const called = vm.callFunction(fn, vm.undefined, input);
if (called.error) throw new Error(JSON.stringify(vm.dump(called.error)));
process.stdout.write('result=' + JSON.stringify(vm.dump(called.value)) + '\n');
called.value.dispose();
input.dispose();
fn.dispose();
vm.dispose();
runtime.dispose();
