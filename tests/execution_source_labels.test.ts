import assert from 'node:assert/strict';
import { formatExecutionSource } from '../src/utils/taskUtils';

assert.equal(formatExecutionSource('scheduler'), 'Schedule');
assert.equal(formatExecutionSource('editor'), 'Editor');
assert.equal(formatExecutionSource('api'), 'API');
assert.equal(formatExecutionSource(null), 'Editor');
assert.equal(formatExecutionSource('agent_block'), 'Agent Block');
console.log('Execution source labels passed.');
