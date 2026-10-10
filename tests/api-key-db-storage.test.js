const assert = require('node:assert/strict');
const fs = require('fs');
const createIdentityStorage = require('../src/server/storage-identity');

const queries = [];
const pool = {
    async connect() {
        return { query: (...args) => this.query(...args), release() {} };
    },
    async query(sql, values) {
        queries.push({ sql, values });
        if (sql.startsWith('SELECT data FROM api_keys')) return { rows: [] };
        if (sql.startsWith('SELECT key FROM api_key')) return { rows: [] };
        return { rows: [] };
    }
};

const storage = createIdentityStorage({
    ensureDB: async () => true,
    getPool: () => pool,
    bulkInsert: async () => {},
    loadUsers: async () => [],
    saveUsers: async () => {}
});

const originalWriteFile = fs.promises.writeFile;
fs.promises.writeFile = async (file, ...args) => {
    if (String(file).includes('api_key_archive_secret')) throw new Error('local filesystem is read-only');
    return originalWriteFile.call(fs.promises, file, ...args);
};

storage.createApiKey({ name: 'DB-only', permissions: ['tasks:read'], taskIds: [] })
    .then(({ key, secret }) => {
        assert.ok(secret);
        assert.equal(key.exportSecret, undefined);
        assert.ok(queries.some(({ sql }) => sql === 'BEGIN'));
        assert.ok(queries.some(({ sql }) => sql.startsWith('INSERT INTO api_keys')));
        assert.ok(queries.some(({ sql }) => sql === 'COMMIT'));
        console.log('API key creation works without a local archive encryption file');
    })
    .catch(error => { console.error(error); process.exitCode = 1; })
    .finally(() => { fs.promises.writeFile = originalWriteFile; });
