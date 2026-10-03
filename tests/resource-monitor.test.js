const assert = require('assert');
const { deriveConcurrency, parseDarwinAvailableBytes } = require('../src/server/resource-monitor');

const fixture = (totalMb, cpuCount = 4) => ({ totalMb, availableMb: totalMb, cpuCount, cpuLoad: 0 });

const previous = process.env.MAX_CONCURRENT_EXECUTIONS;
delete process.env.MAX_CONCURRENT_EXECUTIONS;
assert.strictEqual(deriveConcurrency(fixture(2048)), 1, '2 GiB hosts must run one browser execution');
assert(deriveConcurrency(fixture(4096)) <= 2, '4 GiB hosts must remain conservative');
assert(deriveConcurrency(fixture(8192)) >= 2, 'larger hosts may scale safely');
process.env.MAX_CONCURRENT_EXECUTIONS = '3';
assert.strictEqual(deriveConcurrency(fixture(2048)), 3, 'explicit override wins');
if (previous === undefined) delete process.env.MAX_CONCURRENT_EXECUTIONS; else process.env.MAX_CONCURRENT_EXECUTIONS = previous;

const darwinVmStat = `Mach Virtual Memory Statistics: (page size of 16384 bytes)
Pages free:                               1000.
Pages active:                             9000.
Pages inactive:                           2000.
Pages speculative:                         500.
Pages wired down:                         1000.`;
assert.strictEqual(
    parseDarwinAvailableBytes(darwinVmStat),
    3500 * 16384,
    'macOS available memory must include reclaimable inactive and speculative pages'
);
assert.strictEqual(parseDarwinAvailableBytes('invalid'), null, 'invalid vm_stat output must fall back safely');
console.log('Resource monitor policy tests passed');
