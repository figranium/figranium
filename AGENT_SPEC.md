# Agent Spec (For AI Agents)

This document is a concise, implementation-focused reference for AI agents that generate tasks for Figranium. It covers the JSON schema, supported actions, variable templating, control flow, JavaScript execution context, and extraction scripts.

## Agent task-building rules

### Task design
- Prefer the simplest native Figranium workflow that reliably satisfies the request.
- Do not add actions that duplicate task-level behavior. Never add duplicate `start` / “On Execution” behavior, and do not add redundant `navigate` or wait blocks when task-level behavior already handles them.
- Do not add variables, waits, navigation, JavaScript, loops, or other blocks unless they serve a concrete purpose.
- Do not create configuration options the task does not actually use.
- Prefer native Figranium actions over JavaScript. Use JavaScript only when native actions cannot reliably accomplish the required behavior.
- Preserve intentional ambiguity when it represents a reasonable implementation choice. Do not invent unnecessary requirements, but make sensible implementation decisions when needed to complete the task.

### Variables and runtime state
- Task-level `variables` are inputs/configuration that callers may override before execution. Do not use task variables as final output fields.
- Use `set` for runtime or mid-task state that later blocks need. `set` may create or update a runtime variable.
- Values that depend on execution time, such as “today”, “last 7 days”, or “past 90 days”, must remain dynamic. Do not hard-code the date observed while creating the task unless the user explicitly requests a fixed date.

### Source and extraction
- When the user does not specify a source, choose one that directly represents the requested data rather than fetching a broad unrelated dataset and filtering it afterward.
- Prefer structured first-party/public APIs when they provide the required information reliably.
- Final structured output, including table parsing/extraction, must be produced through the task-level `extractionScript` field. Do not put final result extraction into task variables or ordinary JavaScript action blocks.
- When extracting lists, return consistently structured records and remove obvious duplicates when appropriate.

### Testing and verification
- Unless the user explicitly asks not to test, execute a created or updated task and inspect the actual returned result.
- Do not consider an execution successful merely because its execution status is `success`.
- Verify that the returned result meaningfully satisfies the user's request.
- If the output is empty, malformed, irrelevant, duplicated, unexpectedly null, or otherwise incorrect, fix the task and execute it again.

## 1) Task JSON schema (minimal)
```json
{
  "name": "My Task",
  "description": "Optional human-readable description of what this task does. Shown on the canvas and included in the /api/tasks/list response so AI agents and operators have context.",
  "url": "https://example.com",
  "mode": "agent",
  "wait": 2,
  "selector": "",
  "rotateUserAgents": false,
  "rotateProxies": false,
  "rotateViewport": false,
  "humanTyping": false,
  "stealth": {
    "allowTypos": false,
    "idleMovements": false,
    "overscroll": false,
    "deadClicks": false,
    "fatigue": false,
    "naturalTyping": false
  },
  "autoSolveCaptcha": false,
  "translation": {
    "enabled": false,
    "targetLanguage": "english"
  },
  "downloadCabinetId": "cab_basic",
  "actions": [],
  "variables": {},
  "schedule": {
    "enabled": false,
    "frequency": "daily",
    "hour": 9,
    "minute": 0
  },
  "output": {
    "provider": "baserow",
    "credentialId": "<credential-id>",
    "tableId": "<baserow-table-id>",
    "onError": "ignore"
  }
}
```

## 2) Action types
Supported action `type` values:
```
navigate, click, check, uncheck, drag_and_drop, reload, type, wait, wait_selector, wait_downloads, press, scroll, select, javascript, csv, hover, merge,
screenshot, if, else, end, while, repeat, foreach, stop, set, on_error, start, http_request, get_content,
solve_captcha
wait_captcha
upload, finalize_uploads
```

Common fields:
- `selector` (string): CSS selector used by click/hover/scroll/foreach.
- `clickType` (`single` | `double` | `right`): optional Click interaction mode; omitted defaults to `single`.
- `targetSelector` (string): destination CSS selector required by `drag_and_drop`.
- `value` (string): payload for type/wait/scroll/javascript/start.
- `key` (string): key for `press` (e.g., `Enter`).
- `disabled` (boolean): skip action.
- `varName` (string): target runtime variable for actions such as `set`, `merge`, `foreach`, `http_request`, `get_content`, and CAPTCHA actions. It is not a final output declaration.
- `conditionVar`, `conditionVarType`, `conditionOp`, `conditionValue`: structured conditions for `if` and `while`.
- `cabinetId`: source Cabinet for `upload`; omitted uses the default Cabinet.
- `markAsUploaded`: when true, an Upload action marks its item uploaded after attaching it.

### Element interaction

`click` supports normal, double, and right clicks:

```json
{ "id": "act_open", "type": "click", "selector": ".file", "clickType": "double" }
{ "id": "act_menu", "type": "click", "selector": ".row", "clickType": "right" }
```

`check` ensures a checkbox or radio input is selected; `uncheck` clears a checkbox. Both are idempotent and fail when the selector does not identify a compatible control:

```json
{ "id": "act_optin", "type": "check", "selector": "#newsletter" }
{ "id": "act_optout", "type": "uncheck", "selector": "#newsletter" }
```

`drag_and_drop` moves an element from `selector` to `targetSelector`:

```json
{ "id": "act_move", "type": "drag_and_drop", "selector": ".card", "targetSelector": ".done-column" }
```

`reload` reloads the current page and waits for DOM content to load. `select` chooses an option from a native `<select>` using `selector` and `value`.

### Execution outcomes
Completed `agent` and `scrape` executions return an `outcome` field with one of:

```text
success, error, stopped, crashed, anti_bot
```

- `success`: The task completed normally, including a Stop action whose value is `success`.
- `error`: A Stop action explicitly ended the task with `error`.
- `stopped`: An operator requested cancellation through the execution stop API.
- `crashed`: Execution started but an unhandled browser, network, extraction, or engine error prevented completion.
- `anti_bot`: The final response/page contained an unresolved CAPTCHA, verification challenge, or recognized block response.

`anti_bot` takes precedence over `crashed`, which takes precedence over `stopped`. Classified task outcomes are returned as completed HTTP 200 responses. Request validation, authentication, authorization, and rate-limit errors remain non-2xx responses. Headful session responses do not use this outcome contract.

## 3) Variable templating
Any string can include `{$varName}` tokens.
Example:
```
"value": "Hello {$user.name}"
```

Task-level `variables` are user/caller inputs and configuration defaults. Runtime state belongs in action-created variables such as those produced by `set`; final output belongs in `extractionScript`.

Reserved:
- `{$now}` resolves to ISO timestamp
- `block.output` contains last block output
- `loop.index`, `loop.count`, `loop.item`, `loop.text`, `loop.html` during foreach

### Task page translation

Browser-backed Tasks can translate the rendered target page before their actions and extraction run:

```json
"translation": {
  "enabled": true,
  "targetLanguage": "spanish"
}
```

- `enabled` defaults to `false`.
- `targetLanguage` is a translate.js language name, such as `english`, `spanish`, `french`, `german`, `italian`, `portuguese`, `japanese`, `korean`, `chinese_simplified`, or `arabic`.
- This setting applies to Agent and headful browser sessions, including later navigations in the same page. Scrape mode is HTTP-only and does not execute page translation.
- Enabling translation loads translate.js and sends rendered page text to its configured external translation service. Only enable it for target pages whose content may be shared with that service.

## 4) JavaScript action context
The `javascript` action runs **inside the page** (browser context), not Node. Prefer native actions whenever they can reliably perform the same work.
- `document` and DOM APIs are available.
- `page` is **not** available.
- Return a value from the script to set `block.output` for intermediate use.
- Do not use an ordinary `javascript` action as the task's final structured extraction; use `extractionScript` instead.

Example:
```js
const title = document.title;
return { title };
```

## 5) Extraction scripts (task-level)
Use `extractionScript` and `extractionFormat` at the task level for final structured output. Final table parsing/extraction only works as task output when it is implemented in `extractionScript`. The extraction script runs **after** the page is processed and uses the same page-context rules as `javascript` actions (no `page` object).

Minimal example:
```json
{
  "extractionFormat": "json",
  "extractionScript": "return Array.from(document.querySelectorAll('.card')).map(el => ({ title: el.textContent.trim() }));"
}
```

CSV example:
```json
{
  "extractionFormat": "csv",
  "extractionScript": "return Array.from(document.querySelectorAll('.row')).map(el => ({ name: el.querySelector('.name')?.textContent?.trim() || '' }));"
}
```

## 6) Output — push results to Baserow
Set the `output` field to automatically append `result.data` to a Baserow table after each run.

- `provider`: always `"baserow"` for now.
- `credentialId`: ID of a saved credential (manage via **Settings → Output** in the UI or `POST /api/credentials`).
- `tableId`: numeric Baserow table ID (visible in the table URL).
- `onError`: `"ignore"` (suppress errors) or `"fail"` (log errors prominently in the server console).

The extraction script's return value must be a **JSON object** (→ one row) or **JSON array of objects** (→ batch rows). Object keys must match Baserow field names exactly. `extractionFormat` must be `"json"` when using output (CSV is not supported for push).

Example:
```json
{
  "extractionScript": "return Array.from(document.querySelectorAll('.product')).map(el => ({ Name: el.querySelector('h2').textContent, Price: el.querySelector('.price').textContent }));",
  "extractionFormat": "json",
  "output": {
    "provider": "baserow",
    "credentialId": "cred_abc123",
    "tableId": "42",
    "onError": "fail"
  }
}
```

## 7) Control flow
### If / Else / End
Either use a **JS expression** in `value` or structured fields.

JS expression example:
```json
{ "id": "act_if", "type": "if", "value": "exists('.login')" }
```

Structured example:
```json
{
  "id": "act_if",
  "type": "if",
  "conditionVarType": "string",
  "conditionVar": ".login",
  "conditionOp": "exists",
  "conditionValue": ""
}
```

### While / End
Same condition format as `if`.

### Repeat / End
```json
{ "id": "act_repeat", "type": "repeat", "value": "5" }
```

### Foreach / End
Collect items from selector or variable and iterate.
```json
{ "id": "act_foreach", "type": "foreach", "selector": ".row" }
```

## 7) Condition operators
`string` ops:
- `equals`, `not_equals`, `contains`, `starts_with`, `ends_with`, `matches`

`number` ops:
- `equals`, `not_equals`, `gt`, `gte`, `lt`, `lte`

`boolean` ops:
- `is_true`, `is_false`

`selector` ops:
- `exists`, `not_exists` — checks `action.selector` against the page's DOM (`document.querySelector`), not `conditionVar`/`conditionValue`.

## 8) JS condition helpers (value expression)
If you use `value` as JS expression, these helpers exist:
- `exists(selector)`
- `text(selector)`
- `url()`
- `vars` (variables map)
- `block` (block.output)

Example:
```
exists('.load-more') && text('.count') !== ''
```

## 9) Example: click "Load more" until it disappears
```json
{
  "name": "Load More Until Gone",
  "url": "https://example.com",
  "mode": "agent",
  "wait": 2,
  "selector": "",
  "rotateUserAgents": false,
  "rotateProxies": false,
  "rotateViewport": false,
  "humanTyping": false,
  "stealth": {
    "allowTypos": false,
    "idleMovements": false,
    "overscroll": false,
    "deadClicks": false,
    "fatigue": false,
    "naturalTyping": false
  },
  "actions": [
    {
      "id": "act_while_load_more",
      "type": "while",
      "conditionVarType": "string",
      "conditionVar": ".load-more",
      "conditionOp": "exists",
      "conditionValue": ""
    },
    {
      "id": "act_click_load_more",
      "type": "click",
      "selector": ".load-more"
    },
    {
      "id": "act_wait_after_click",
      "type": "wait",
      "value": "1.5"
    },
    { "id": "act_end_while", "type": "end" }
  ],
  "variables": {}
}
```

## 10) Example: set + merge variables
```json
{
  "id": "act_set",
  "type": "set",
  "varName": "user.name",
  "value": "Ada"
}
```

```json
{
  "id": "act_merge",
  "type": "merge",
  "varName": "payload",
  "value": "{$user}, {$extra}"
}
```

## 11) Example: JavaScript action output (intermediate only)
```json
{
  "id": "act_js",
  "type": "javascript",
  "value": "return Array.from(document.querySelectorAll('.item')).map(el => el.textContent.trim());"
}
```

Use this only when the value is needed during the action sequence. For the task's final structured result, put the equivalent parsing in `extractionScript`.

## 12) Stop action
```json
{ "id": "act_stop", "type": "stop", "value": "success" }
```

The Stop action accepts only `success` or `error`. The `stopped`, `crashed`, and `anti_bot` outcomes are assigned automatically by the runtime.

## 13) Start another task
```json
{ "id": "act_start", "type": "start", "value": "task_id_here" }
```

`start` starts another task; it is not a generic “On Execution” marker. Do not add duplicate `start` actions or use them to reproduce task-level startup behavior.

## 14) HTTP Request
Make an arbitrary HTTP API call. The response is automatically parsed as JSON (falls back to text). Throws on non-2xx status.
```json
{
  "id": "act_http",
  "type": "http_request",
  "method": "POST",
  "value": "https://api.example.com/endpoint",
  "headers": "{\"Authorization\": \"Bearer {$token}\"}",
  "body": "{\"key\": \"{$value}\"}",
  "varName": "apiResponse"
}
```
- `method`: HTTP verb — `GET`, `POST`, `PUT`, `PATCH`, or `DELETE` (default: `GET`).
- `value`: The request URL. Supports variable templating. Validated against SSRF rules.
- `headers`: Optional JSON string of request headers. Supports variable templating.
- `body`: Optional request body (for POST/PUT/PATCH/DELETE). Supports variable templating.
- `varName`: Optional runtime variable name to store the parsed response for use in later actions.

## 15) Get Content
Extract the visible text content (`innerText`) of a page or a specific element and optionally store it in a runtime variable.
```json
{
  "id": "act_content",
  "type": "get_content",
  "selector": ".article-body",
  "varName": "pageContent"
}
```
- `selector`: Optional CSS selector. If omitted, returns the full page body text.
- `varName`: Optional runtime variable name to store the result. Also available as `{$block.output}` in the next action.

## 16) Solve CAPTCHA

Detect and solve a CAPTCHA challenge on the current page. A configured YesCaptcha/AntiCaptcha-compatible endpoint is tried first; otherwise the optional resource-adaptive solver uses the task's active browser session and injects the resulting token and callback events.
```json
{
  "id": "act_captcha",
  "type": "solve_captcha",
  "captchaType": "recaptcha_v2",
  "selector": "#recaptcha-container",
  "varName": "captchaResult",
  "timeout": 120000
}
```
- `captchaType`: Optional — one of `recaptcha_v2`, `recaptcha_v3`, `hcaptcha`, `turnstile`. If omitted, the challenge type is auto-detected from the page.
- `selector`: Optional CSS selector scoping the search to a specific container (e.g. the widget's iframe wrapper). If omitted, the whole page is scanned.
- `varName`: Optional runtime variable name to store solve metadata (`{ success, challenge, duration, provider, model?, device?, attempts }`). Existing fields remain stable; `attempts` describes remote/local routing outcomes without credentials or tokens.
- `timeout`: Terminal deadline in milliseconds (default: 120000 for the action). Provider errors are returned immediately rather than being reported as timeouts.
- Local image solving requires at least 2 GiB effective cgroup memory. Lower-memory hosts remain compatible with remote endpoints.
- `SKIP_LOCAL_CAPTCHA_MODEL=true` disables all local probing and downloads, including on sufficiently provisioned hosts.
- Remote proxy and origin-scoped browser-context forwarding are separate explicit opt-ins. Context is accepted only by custom endpoints advertising the versioned capability; secrets are redacted from terminal errors and logs.
- reCAPTCHA and hCaptcha image challenges share an active-browser grid engine supporting 3×3/4×4 layouts and changed replacement tiles. Turnstile and checkbox-only test-key flows remain model-free.
- Top-level task field `autoSolveCaptcha` (default `false`): when `true`, the agent automatically runs detection and solves a captcha after every `navigate`, `click`, or `type` action, without needing an explicit `solve_captcha` block. Off by default so tasks that don't need it pay no extra latency; the explicit block above still works either way.

## 17) Wait for CAPTCHA

Wait until a CAPTCHA is initialized and ready for interaction without clicking or solving it.
```json
{
  "id": "act_wait_captcha",
  "type": "wait_captcha",
  "captchaType": "recaptcha_v2",
  "selector": "#recaptcha-container",
  "varName": "captchaReady",
  "timeout": 120000
}
```
- `captchaType`: Optional provider filter. Uses the same values as `solve_captcha`; omitted means auto-detect.
- `selector`: Optional CSS selector scoping detection to a widget container.
- `timeout`: Maximum readiness wait in milliseconds (default `120000`).
- `varName`: Optional runtime variable receiving `{ ready, challenge, duration, siteKey? }`. The same object is available as `{$block.output}`.
- Checkbox challenges become ready only when their control is visible, enabled, pointer-receivable, and positionally stable. Invisible and non-interactive variants use their initialized/executable provider state.
- The action never clicks or solves the challenge. A timeout marks the block as failed and follows the normal `on_error`/continue behavior.

## 18) Upload from a Cabinet

```json
{ "id": "act_upload", "type": "upload", "cabinetId": "cab_basic", "selector": "input[type=file]", "markAsUploaded": false }
```

Upload selects the latest unuploaded file, ZIP, or folder in the Cabinet. It supports file inputs, labels that resolve to file inputs, custom file choosers, and drop targets. A folder requires a directory-enabled input. Use the following action after successful page-side submission when upload status should be deferred:

```json
{ "id": "act_finalize_uploads", "type": "finalize_uploads" }
```

## 19) Notes for AI agents
- Prefer native Figranium actions and the smallest reliable task; do not add duplicate task-level behavior.
- Use waits only when a concrete readiness condition requires them. Keep fixed waits short; use 1-2s unless the target site is slow.
- Task variables are inputs/configuration, not outputs. Use runtime variables for intermediate state and `extractionScript` for final structured output.
- `javascript` actions are page-context only (no `page` object) and should be used only when native actions are insufficient.
- Prefer structured conditions for selectors (`exists` with selector).
- Always close block structures with `end`.
