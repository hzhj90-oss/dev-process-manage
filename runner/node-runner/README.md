# Node Runner

Node Runner is an independent process that polls the management API for fixed scripts with language NODE. Script source is executed inside a QuickJS WebAssembly runtime; it is not evaluated by the host Node.js runtime.

## Start and stop

Run from PowerShell:

    powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\start.ps1
    powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\start-node-runner.ps1

    powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\stop-node-runner.ps1

The application startup script creates a random shared Runner token in .local/runner-token.txt. The token is inherited by the Spring Boot and Runner processes and is never printed.

Logs:
- logs/node-runner.stdout.log
- logs/node-runner.stderr.log
- logs/node-runner.pid

Install dependencies after a clean checkout:

    cd runner\node-runner
    npm ci
    npm test

The dependency quickjs-emscripten is pinned to 0.32.0. The committed package-lock.json provides reproducible installation.

## Script contract

- Source type: INLINE only. FILE is rejected by the backend in v1.
- Entry point: a synchronous JavaScript function, normally main(ctx).
- Source size: at most 100 KiB measured in UTF-8 bytes.
- Input context: at most 256 KiB.
- Each script must record at least one assertion.
- At most 100 assertions and 10,000 log characters are retained.
- Timeout: 5 seconds.
- QuickJS guest heap: 32 MiB.
- QuickJS stack: 512 KiB.
- Async entry points are not supported in v1.

Example:

    function main(ctx) {
      console.log("Running case", ctx.case.caseNo);

      assert.equal(ctx.args.expectedStatus, "ACTIVE", "expected status");
      assert.exists(ctx.case.caseNo, "case number exists");
      assert.contains(["ACTIVE", "PENDING"], ctx.args.expectedStatus);

      return {
        caseNo: ctx.case.caseNo,
        environment: ctx.environment.code
      };
    }

The input context contains:
- ctx.case: immutable test-case snapshot.
- ctx.args: immutable script arguments.
- ctx.environment: environment code, name and type only; no credential values.
- ctx.cycleId, ctx.cycleCaseId and ctx.codeVersion.

Supported host APIs:
- console.log/info/warn/error
- assert.equal(actual, expected, description)
- assert.deepEqual(actual, expected, description)
- assert.ok(value, description)
- assert.exists(value, description)
- assert.contains(actual, expected, description)

## Isolation boundary

The user script runs in a QuickJS WebAssembly interpreter with a separate guest heap. The host does not expose Node.js process, require, filesystem, child_process, worker_threads, fetch, XMLHttpRequest, WebSocket, timers, or module loading.

The script can use the JavaScript language and built-ins provided by QuickJS, but it is not a full Node.js runtime. Node built-in modules, npm packages, filesystem operations, arbitrary network calls and asynchronous host I/O are intentionally unavailable. Use the separate HTTP DSL Runner for supported read-only HTTP checks.

The host Node Runner process alone communicates with the management API. The script cannot access the host process or its network client through the exposed API. Execution is limited by QuickJS memory, stack and interrupt deadlines.

Result mapping:
- PASS: at least one assertion was recorded and every assertion passed.
- FAIL: script syntax/runtime error or at least one assertion failed.
- BLOCKED: timeout, memory limit, no assertions, async entry point, or assertion-count limit.
- FAILED task: Runner engine/protocol failure reported through the Runner fail endpoint.

## Runner protocol

- POST /api/runner/claim with runnerType=NODE.
- The backend only returns queued NODE + INLINE tasks from RUNNING, non-PROD cycles.
- The Runner renews the lease, records STEP_STARTED, LOG, ASSERTION_PASSED/FAILED and STEP_COMPLETED events, then commits the result.
- The database stores only the lease-token SHA-256 hash.
- If the Runner exits unexpectedly, lease expiry and the existing recovery scanner mark the task RECOVERY_REQUIRED. The Runner never automatically replays an interrupted attempt.
