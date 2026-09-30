const assert = require('assert');
const { deriveConcurrency } = require('../src/server/resource-monitor');

const fixture = (totalMb, cpuCount = 4) => ({ totalMb, availableMb: totalMb, cpuCount, cpuLoad: 0 });

const previous = process.env.MAX_CONCURRENT_EXECUTIONS;
delete process.env.MAX_CONCURRENT_EXECUTIONS;
assert.strictEqual(deriveConcurrency(fixture(2048)), 1, '2 GiB hosts must run one browser execution');
assert(deriveConcurrency(fixture(4096)) <= 2, '4 GiB hosts must remain conservative');
assert(deriveConcurrency(fixture(8192)) >= 2, 'larger hosts may scale safely');
process.env.MAX_CONCURRENT_EXECUTIONS = '3';
assert.strictEqual(deriveConcurrency(fixture(2048)), 3, 'explicit override wins');
if (previous === undefined) delete process.env.MAX_CONCURRENT_EXECUTIONS; else process.env.MAX_CONCURRENT_EXECUTIONS = previous;
console.log('Resource monitor policy tests passed');
