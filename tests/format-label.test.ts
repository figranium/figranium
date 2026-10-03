import assert from 'node:assert/strict';
import { formatLabel } from '../src/utils/taskUtils';

assert.equal(formatLabel('unuploaded'), 'Unuploaded');
assert.equal(formatLabel('in_progress'), 'In Progress');
assert.equal(formatLabel('wait-downloads'), 'Wait Downloads');
assert.equal(formatLabel('  latest   result  '), 'Latest Result');
assert.equal(formatLabel(''), '');

console.log('Label formatting tests passed');
