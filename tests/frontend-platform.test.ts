import { strict as assert } from 'node:assert';
import { isCloud } from '../src/platform/runtime';
import { taskFetch, localTaskStreamUrl } from '../src/platform/api';
assert.equal(isCloud, false);
assert.equal(localTaskStreamUrl('task_123', false), '/api/tasks/task_123/stream');
assert.equal(localTaskStreamUrl('task/a', false), '/api/tasks/task%2Fa/stream');
assert.equal(localTaskStreamUrl('new_123', false), null);
assert.equal(localTaskStreamUrl(undefined, false), null);
assert.equal(localTaskStreamUrl('task_123', true), null); // Cloud must not open a cookie-based stream
const oldFetch = globalThis.fetch;
try {
    let count = 0;
    globalThis.fetch = (async (path: RequestInfo | URL, init?: RequestInit) => {
        count++;
        assert.equal(path, '/api/tasks?update=true');
        assert.equal(init?.method, 'POST');
        return new Response('{}');
    }) as typeof fetch;
    await taskFetch('/api/tasks?update=true', { method: 'POST', body: '{}' });
    assert.equal(count, 1);
} finally { globalThis.fetch = oldFetch; }
console.log('Default self-hosted frontend API unchanged');
