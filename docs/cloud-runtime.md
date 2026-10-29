# Figranium Cloud runtime contract (experimental)

Self-hosted Figranium **does not change**: `npm start`, its Express routes,
local authentication, session storage, schedulers, and file/DB storage continue
to operate by default. Cloud must **not** start `server.js` or expose the
self-hosted UI and login routes to customers.

## Execution split

Cloudflare / Neon / R2 own identity, tenant authorization, CU reservation,
Task persistence, schedules, credential handling and result storage. Each Modal
Sandbox runs **one** authorized Figranium Task using `cloud-runner.js` as a
headless engine entrypoint. The runner does not authenticate users, issue
sessions, make tenant-authorization decisions, or access the Cloud database.
Cloud must securely deliver the envelope and collect the private result file.

Runner input (trusted Cloud dispatcher, not direct public access):

```json
{
  "version": 1,
  "executionId": "execution_123",
  "engine": "agent",
  "task": { "url": "https://example.com", "actions": [] },
  "timeoutMs": 30000
}
```

Launch **inside an already isolated, hard-time-limited Modal Sandbox**:

```sh
FIGRANIUM_RUNTIME=cloud-runner node cloud-runner.js /tmp/cloud-input.json /tmp/cloud-output.json
```

Result file contains `version`, `executionId`, `engine`, `durationMs`,
`outcome`, and `result`, or a generic error code. No extracted data is
printed to stdout. The Cloud dispatcher must upload the file to tenant-scoped
R2 **before** the Sandbox terminates and then update Neon transactionally.
Neither public execution authorization nor metering is provided by the runner.

**Security / production gates:** This is the data-plane boundary, not yet a
production-safe Cloud service. The Agent engine still writes captures, browser
state, and other temporary artifacts to local paths. Use a fresh ephemeral
Sandbox per Execution, with **no shared filesystem, database credentials,
long-lived browser cookies, public inbound port or direct tenant access**.
Restrict egress and Cloud-provided URL destinations, enforce hard CPU/RAM/time
limits in Modal, and fix the known extraction-script sandbox escape before
launch. A JavaScript timeout alone does not kill a running browser. Never expose
this CLI as an unauthenticated network service. Templates and payloads are
untrusted until validated by the Cloud control plane.
