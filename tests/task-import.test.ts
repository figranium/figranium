import { strict as assert } from 'node:assert';
import type { Task } from '../src/types';
import { createImportedTasks } from '../src/utils/taskUtils';

const tasks = ['one', 'two', 'three'].map((id) => ({ id, name: id } as Task));

const allSucceeded = await createImportedTasks(tasks, async () => new Response('{}', { status: 201 }));
assert.deepEqual(allSucceeded, { imported: 3, failed: 0, firstError: undefined });

const attempted: string[] = [];
const partial = await createImportedTasks(tasks, async (task) => {
    attempted.push(task.id!);
    if (task.id === 'one') return new Response('{}', { status: 201 });
    if (task.id === 'two') {
        return new Response(JSON.stringify({ error: 'TASK_REJECTED' }), {
            status: 422,
            headers: { 'Content-Type': 'application/json' }
        });
    }
    throw new TypeError('Network unavailable');
});
assert.deepEqual(attempted, ['one', 'two', 'three']);
assert.deepEqual(partial, { imported: 1, failed: 2, firstError: 'TASK_REJECTED' });

const allFailed = await createImportedTasks(tasks, async () => new Response('not-json', { status: 503 }));
assert.deepEqual(allFailed, { imported: 0, failed: 3, firstError: 'HTTP 503' });
console.log('Task import correctly distinguishes successful, failed, and partial HTTP batches');
