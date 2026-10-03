const Module = require('module');
const originalRequire = Module.prototype.require;
const path = require('path');
const assert = require('assert');

// Mock for db.js
const mockDB = {
    data: {},
    queryCount: 0,
    async query(text, values) {
        this.queryCount++;
        // console.log('DB QUERY:', text, values);
        if (text.includes('CREATE TABLE') || text.includes('ALTER TABLE') || text.includes('BEGIN') || text.includes('COMMIT') || text.includes('TRUNCATE')) {
            if (text.includes('TRUNCATE executions')) this.data.executions = [];
            return { rows: [] };
        }
        if (text.includes('INSERT INTO execution_results')) {
            this.data.execution_results = this.data.execution_results || {};
            this.data.execution_results[values[0]] = values[1];
            return { rows: [] };
        }
        if (text.includes('SELECT data FROM execution_results')) {
            const result = this.data.execution_results?.[values[0]];
            return { rows: result ? [{ data: result }] : [] };
        }
        if (text.includes('DELETE FROM execution_results')) {
            for (const id of values[0]) delete this.data.execution_results?.[id];
            return { rows: [] };
        }
        if (text.includes('SELECT COUNT(*) FROM executions')) {
            return { rows: [{ count: String((this.data.executions || []).length) }] };
        }
        if (text.includes('INSERT INTO executions')) {
            this.data.executions = this.data.executions || [];
            const index = this.data.executions.findIndex((entry) => entry.id === values[0]);
            if (index >= 0) this.data.executions[index] = values[1];
            else this.data.executions.push(values[1]);
            return { rows: [] };
        }
        if (text.includes('SELECT data FROM credentials')) {
            return { rows: (this.data.credentials || []).map(d => ({ data: d })) };
        }
        if (text.includes('INSERT INTO credentials')) {
            this.data.credentials = this.data.credentials || [];
            this.data.credentials.push(values[1]);
            return { rows: [] };
        }
        if (text.includes('SELECT data FROM proxies_config')) {
            return { rows: this.data.proxies_config ? [{ data: this.data.proxies_config }] : [] };
        }
        if (text.includes('INSERT INTO proxies_config')) {
            this.data.proxies_config = values[0];
            return { rows: [] };
        }
        return { rows: [] };
    },
    async connect() {
        return {
            query: this.query.bind(this),
            release: () => {}
        };
    }
};

Module.prototype.require = function (id) {
    if (id === 'pg') {
        return { Pool: function() { return mockDB; } };
    }
    if (id.endsWith('src/server/db') || id.endsWith('./src/server/db') || id === './db') {
        return {
            initDB: async () => mockDB,
            getPool: () => mockDB
        };
    }
    return originalRequire.apply(this, arguments);
};

process.env.DB_TYPE = 'postgres';
process.env.DB_POSTGRESDB_HOST = 'localhost';
process.env.DB_POSTGRESDB_PORT = '5432';
process.env.DB_POSTGRESDB_USER = 'user';
process.env.DB_POSTGRESDB_PASSWORD = 'pass';
process.env.MAX_PERSISTED_EXECUTION_BYTES = '256';

const {
    loadCredentials, saveCredentials, upsertExecution, getExecutionById,
    loadFullExecutionResult, saveExecutions
} = require('../src/server/storage');
const ProxyRotation = require('../proxy-rotation');

async function runTests() {
    console.log('--- Database Storage Integration Test ---');

    // Test Credentials
    await saveCredentials([{ label: 'test', value: 'secret' }]);
    const creds = await loadCredentials();
    if (creds[0].label === 'test') {
        console.log('SUCCESS: Credentials saved and loaded from DB.');
    } else {
        console.error('FAIL: Credentials mismatch:', creds);
    }

    // Test Proxies
    await ProxyRotation.ensureDB(); // Initialize DB for proxies
    await ProxyRotation.setRotationMode('random');
    const proxies = await ProxyRotation.loadProxyConfigAsync();
    if (proxies.rotationMode === 'random') {
        console.log('SUCCESS: Proxy config saved and loaded from DB.');
    } else {
        console.error('FAIL: Proxy config mismatch:', proxies);
    }

    // Oversized execution data remains available on demand without bloating history.
    const fullData = { data: 'x'.repeat(2048), logs: ['complete'], outcome: 'success' };
    await upsertExecution({ id: 'full-result', timestamp: Date.now(), result: fullData });
    const summary = getExecutionById('full-result');
    assert.equal(summary.result.hasFullResult, true);
    assert.equal(summary.result.data, undefined);
    assert.deepEqual(await loadFullExecutionResult('full-result'), fullData);
    await saveExecutions([]);
    assert.equal(await loadFullExecutionResult('full-result'), null);
    console.log('SUCCESS: Oversized execution results load on demand and clean up with history.');

    console.log('Total DB Queries:', mockDB.queryCount);
}

runTests().catch(console.error);
