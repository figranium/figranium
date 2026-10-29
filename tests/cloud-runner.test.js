'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { validateEnvelope, executeCloudTask, writePrivateReport, MAX_DURATION_MS } = require('../cloud-runner');

const input = { executionId: 'execution_123', engine: 'agent', task: { url: 'https://example.com', actions: [] } };

test('cloud envelope forces isolated cookies and the server-assigned run id', () => {
    const env = validateEnvelope({ ...input, task: { ...input.task, isolatedCookies: false } });
    assert.equal(env.task.runId, 'execution_123');
    assert.equal(env.task.isolatedCookies, true);
    assert.equal(env.timeoutMs, MAX_DURATION_MS);
});

test('rejects unsupported engines, run-id substitution and overlong timeouts', () => {
    assert.throws(() => validateEnvelope({ ...input, engine: 'headful' }), /INVALID_ENGINE/);
    assert.throws(() => validateEnvelope({ ...input, task: { ...input.task, runId: 'other' } }), /RUN_ID_MISMATCH/);
    assert.throws(() => validateEnvelope({ ...input, timeoutMs: MAX_DURATION_MS + 1 }), /INVALID_TIMEOUT/);
    assert.throws(() => validateEnvelope({ ...input, task: { actions: [] } }), /INVALID_TASK_URL/);
});

test('dispatches Agent directly, without starting Express or performing local login', async () => {
    let called;
    const report = await executeCloudTask(input, { agent: async (task, options) => {
        called = { task, options };
        return { outcome: 'success', data: [{ name: 'Example' }] };
    } });
    assert.equal(called.task.runId, 'execution_123');
    assert.deepEqual(called.options, { headless: true });
    assert.equal(report.result.data[0].name, 'Example');
});

test('writes private JSON atomically with owner-only permissions', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'figranium-cloud-runner-'));
    try {
        const file = path.join(dir, 'result.json');
        await writePrivateReport(file, { outcome: 'success', result: { data: [1] } });
        assert.equal(JSON.parse(await fs.readFile(file, 'utf8')).result.data[0], 1);
        if (process.platform !== 'win32') assert.equal((await fs.stat(file)).mode & 0o777, 0o600);
    } finally { await fs.rm(dir, { recursive: true, force: true }); }
});

test('does not assume success on a non-success engine outcome', async () => {
    const result = await executeCloudTask(input, { agent: async () => ({ outcome: 'anti_bot', data: null }) });
    assert.equal(result.outcome, 'anti_bot');
});
