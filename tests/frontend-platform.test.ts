import { strict as assert } from 'node:assert';
import { isCloud } from '../src/platform/runtime';
import { taskFetch, localTaskStreamUrl, taskEditorResourcePath, taskEditorResourceItems } from '../src/platform/api';
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

// Task Settings must use tenant-scoped Cloud endpoints and normalize the
// Worker's { items } payload without changing self-hosted response contracts.
assert.equal(taskEditorResourcePath('cookie-states', false), '/api/cookie-states');
assert.equal(taskEditorResourcePath('cabinets', false), '/api/cabinets');
assert.equal(taskEditorResourcePath('cookie-states', true), '/api/v1/cookie-states');
assert.equal(taskEditorResourcePath('cabinets', true), '/api/v1/cabinets');
const sample = [{ id: 'one', name: 'Test' }];
assert.deepEqual(taskEditorResourceItems('cookie-states', { states: sample }, false), sample);
assert.deepEqual(taskEditorResourceItems('cabinets', { cabinets: sample }, false), sample);
assert.deepEqual(taskEditorResourceItems('cookie-states', { items: sample }, true), sample);
assert.deepEqual(taskEditorResourceItems('cabinets', { items: sample }, true), sample);
assert.deepEqual(taskEditorResourceItems('cookie-states', { states: sample }, true), []);
assert.deepEqual(taskEditorResourceItems('cabinets', null, true), []);

console.log('Default self-hosted frontend API unchanged');
