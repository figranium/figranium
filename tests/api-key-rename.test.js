const assert = require('node:assert/strict');
const createIdentityStorage = require('../src/server/storage-identity');

const original = { id: 'key_1', name: 'Original', salt: 'salt', hash: 'hash', permissions: ['tasks:run'], taskIds: ['task_1'], createdAt: '2026-01-01' };
const legacy = { ...original, id: 'legacy', name: 'Legacy', legacy: true };
let failWrite = false;
const pool = {
    async query(sql) { return sql.startsWith('SELECT data FROM api_keys') ? { rows: [{ data: original }, { data: legacy }] } : { rows: [] }; },
    async connect() { return { query: async sql => { if (failWrite && sql.startsWith('INSERT')) throw new Error('write failed'); }, release() {} }; }
};
const storage = createIdentityStorage({ ensureDB: async () => true, getPool: () => pool, bulkInsert: async () => {}, loadUsers: async () => [], saveUsers: async () => {} });

(async () => {
    const renamed = await storage.renameApiKey('key_1', '  Renamed  ');
    assert.deepEqual(renamed, { ...original, name: 'Renamed' });
    assert.equal((await storage.loadApiKeys())[0].name, 'Renamed');
    for (const name of ['', '  ', 1, 'x'.repeat(121)]) await assert.rejects(storage.renameApiKey('key_1', name), /INVALID_API_KEY_NAME/);
    await assert.rejects(storage.renameApiKey('missing', 'Name'), /API_KEY_NOT_FOUND/);
    await assert.rejects(storage.renameApiKey('legacy', 'Name'), /LEGACY_API_KEY/);
    failWrite = true;
    await assert.rejects(storage.renameApiKey('key_1', 'Failed'), /write failed/);
    assert.equal((await storage.loadApiKeys())[0].name, 'Renamed');
    assert.equal((await storage.loadApiKeys())[1].name, 'Legacy');
    console.log('API key rename preserves metadata and rejects invalid or legacy changes');
})().catch(error => { console.error(error); process.exitCode = 1; });
