import assert from 'node:assert/strict';
import { executeBrowserScript } from './browser-engine.mjs';

const controller = new AbortController();
let navigationFinished = false;
const start = Date.now();
const source = JSON.stringify({version:1,timeoutMs:20000,steps:[
  { action:'GOTO',path:'/#/test-reports' },
  { action:'WAIT_VISIBLE',selector:'#browser-abort-never-present' },
  { action:'ASSERT_VISIBLE',selector:'h1' }
]});
await assert.rejects(executeBrowserScript({
  source, chromePath:process.env.DPM_CHROME_PATH,
  environment:{baseUrl:'http://127.0.0.1:18090',environmentType:'TEST',authType:'NONE'},
  abortSignal:controller.signal,
  onStep:async index=>{
    if(index===0){
      navigationFinished=true;
      setTimeout(()=>controller.abort(),200);
    }
  }
}),/Browser execution cancelled or lease lost/);
const elapsed=Date.now()-start;
assert.equal(navigationFinished,true,'Navigation should complete before forced lease loss');
assert.ok(elapsed<4200,'Active wait should end immediately on abort, elapsed='+elapsed+'ms');
console.log('BROWSER_ABORT_SMOKE_PASS elapsedMs='+elapsed);
