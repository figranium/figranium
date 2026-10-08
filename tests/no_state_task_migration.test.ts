import assert from 'node:assert/strict';
import { buildNewTask, normalizeImportedTask } from '../src/utils/taskUtils';

const migratedTask = normalizeImportedTask({
    name: 'Legacy stateless task',
    url: 'https://example.com',
    statelessExecution: true,
    cookieStateId: 'cookies_saved',
}, 0);

assert.equal(migratedTask?.cookieStateId, null);
assert.equal('statelessExecution' in (migratedTask || {}), false);

const defaultTask = normalizeImportedTask({
    name: 'Legacy default task',
    url: 'https://example.com',
    statelessExecution: false,
}, 0);
assert.equal(defaultTask?.cookieStateId, undefined);
assert.equal('statelessExecution' in (defaultTask || {}), false);
assert.equal('statelessExecution' in buildNewTask(), false);

console.log('No State task migration checks passed');
