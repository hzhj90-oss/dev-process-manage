# HTTP Runner

HTTP Runner is an independent Node.js process. It polls the local management API for eligible SCRIPT + HTTP tasks; it does not listen on an inbound port and does not execute arbitrary JavaScript from the script library.

## Start and stop

Run from PowerShell:

    powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\start.ps1
    powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\start-http-runner.ps1

    # Stop only the independent Runner process
    powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\stop-http-runner.ps1

The application startup script creates a random shared Runner token in .local/runner-token.txt. The .local directory is Git-ignored. The token is inherited by the Spring Boot and Runner processes and is never printed to the console. Do not copy it into source code, scripts, or documentation.

Logs:
- logs/http-runner.stdout.log
- logs/http-runner.stderr.log
- logs/http-runner.pid

## Execution boundary

- The Runner only claims HTTP executions with an INLINE script snapshot.
- The cycle must be RUNNING; production (PROD) tasks are never claimed.
- Environment authentication must be NONE in this first phase. Other authentication modes return BLOCKED until a secure credential resolver is integrated.
- Only GET, HEAD, and OPTIONS are supported. Request bodies are rejected.
- Redirects are not followed. The request target must remain on the selected environment base URL origin.
- API/WEB base URLs come from the immutable test-cycle environment snapshot. The DSL path is relative to the configured base URL path; for example, apiBaseUrl=http://127.0.0.1:18090/api plus path=/health requests /api/health.
- Sensitive header/query names such as Authorization, Cookie, token, api_key, password, and credential are rejected. Values are recursively redacted before event persistence.
- Request timeout is 1–30 seconds. Response bodies are capped at 100 KiB; oversized responses finish as BLOCKED rather than producing a false assertion result.

## DSL v1

Example: request the local health endpoint when the environment API base URL is http://127.0.0.1:18090/api.

    {
      "version": 1,
      "request": {
        "base": "API",
        "method": "GET",
        "path": "/health",
        "timeoutMs": 10000,
        "headers": {
          "Accept-Language": "en-US"
        },
        "query": {}
      },
      "assertions": [
        {
          "type": "STATUS_EQUALS",
          "expected": 200,
          "description": "HTTP status is 200"
        },
        {
          "type": "JSON_PATH_EQUALS",
          "path": "$.status",
          "expected": "UP",
          "description": "Health status is UP"
        }
      ]
    }

Supported assertions:
- STATUS_EQUALS: compare the HTTP status code.
- HEADER_EQUALS: compare a response header.
- JSON_PATH_EQUALS: compare a JSON value using a restricted path such as $.data.items[0].id.
- JSON_PATH_EXISTS: check that a JSON path exists.
- BODY_CONTAINS: check that the response text contains a string.

The JSON path syntax supports object properties and numeric array indexes only. It does not support recursive descent, filters, scripts, or arbitrary expressions.

## Runner API protocol

- POST /api/runner/claim — shared-token authentication; atomically claim one eligible task and receive a one-time lease token.
- POST /api/runner/tasks/{taskId}/heartbeat — renew the lease.
- POST /api/runner/tasks/{taskId}/events — append idempotent request/response/assertion events.
- POST /api/runner/tasks/{taskId}/complete — commit PASS, FAIL, or BLOCKED.
- POST /api/runner/tasks/{taskId}/fail — mark an execution-engine failure as FAILED.

The database stores only the SHA-256 hash of the lease token. If the Runner process exits, the lease expires and the existing recovery scheduler marks the task RECOVERY_REQUIRED. Recovery is explicit; the Runner never automatically replays an interrupted attempt.
