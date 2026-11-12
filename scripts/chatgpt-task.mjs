#!/usr/bin/env node
// Tool-friendly adapter for ChatGPT's connected local terminal.
// Does not run a model, generate tests, execute external scripts, or auto-claim tasks.
import { runAiCommand } from './chatgpt-task-client.mjs'

try {
  const output = await runAiCommand(process.argv.slice(2))
  process.stdout.write(JSON.stringify(output, null, 2) + '\n')
} catch (error) {
  process.stderr.write('DPM_AI_COMMAND_FAILED: ' + String(error.message || '操作失败') + '\n')
  process.exitCode = 1
}
