const assert = require('assert');
const fs = require('fs');
const { TELEMETRY_STATE_FILE } = require('../src/server/constants');

const original = process.env.FIGRANIUM_TELEMETRY_ENABLED;
process.env.FIGRANIUM_TELEMETRY_ENABLED = 'false';
delete require.cache[require.resolve('../src/server/telemetry')];
const telemetry = require('../src/server/telemetry');
try { fs.unlinkSync(TELEMETRY_STATE_FILE); } catch (_) { }

telemetry.recordActivity('ui');
assert.strictEqual(telemetry.isEnabled(), false);
assert.strictEqual(fs.existsSync(TELEMETRY_STATE_FILE), false, 'opt-out must not write local telemetry state or make requests');

if (original === undefined) delete process.env.FIGRANIUM_TELEMETRY_ENABLED;
else process.env.FIGRANIUM_TELEMETRY_ENABLED = original;
console.log('Telemetry opt-out test passed');
