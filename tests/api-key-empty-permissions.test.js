const assert = require('node:assert/strict');
const createIdentityStorage = require('../src/server/storage-identity');

const storage = createIdentityStorage({ ensureDB: async () => false, getPool: () => null, bulkInsert: async () => {}, loadUsers: async () => [], saveUsers: async () => {} });

Promise.all([
    assert.rejects(() => storage.createApiKey({ name: 'bad', permissions: ['unknown'], taskIds: [] }), /PERMISSIONS_REQUIRED/),
    assert.rejects(() => storage.createApiKey({ name: 'empty', permissions: [], taskIds: [] }), /PERMISSIONS_REQUIRED/),
]).then(() => console.log('Empty API key permissions rejected')).catch(error => { console.error(error); process.exitCode = 1; });
