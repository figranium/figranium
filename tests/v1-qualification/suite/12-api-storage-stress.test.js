const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const crypto = require('node:crypto');
const storage = require('../../../src/server/storage');
const db = require('../../../src/server/db');

const cwd = path.resolve(__dirname, '../../..');
function isolated(script, timeout = 20000) {
    const result = spawnSync(process.execPath, ['-e', script], {
        cwd, env: { ...process.env }, encoding: 'utf8', timeout
    });
    assert.equal(result.status, 0, result.stderr || result.stdout || String(result.error));
}
const tests = [
    {
        id: 'STRESS-001', name: 'Scoped API keys: create, authenticate, restrict, revoke',
        subsystem: 'stress', severity: 'CRITICAL', blocksV1: true,
        setup: 'Real PostgreSQL qualification database', steps: 'Create task-scoped key, verify, revoke and verify rejection',
        expected: 'Key is only shown at creation, hash is stored, scope is preserved and revoked keys cannot authenticate',
        run: async () => {
            const original = await storage.loadApiKeys();
            const name = 'Qualification scoped key ' + crypto.randomBytes(4).toString('hex');
            let created;
            try {
                created = await storage.createApiKey({ name, permissions: ['tasks:read'], taskIds: ['qualification-only-task'] });
                assert.ok(created.secret.length >= 32);
                assert.ok(!JSON.stringify(created.key).includes(created.secret));
                assert.deepEqual(created.key.permissions, ['tasks:read']);
                assert.deepEqual(created.key.taskIds, ['qualification-only-task']);
                assert.equal((await storage.verifyApiKey(created.secret)).id, created.key.id);
                assert.equal(await storage.verifyApiKey('invalid-' + created.secret), null);
                assert.equal(await storage.revokeApiKey(created.key.id), true);
                assert.equal(await storage.verifyApiKey(created.secret), null);
            } finally {
                if (created) await storage.revokeApiKey(created.key.id);
                assert.deepEqual((await storage.loadApiKeys()).map(k => k.id).sort(), original.map(k => k.id).sort());
            }
        }
    },
    {
        id: 'STRESS-002', name: 'Scoped key persistence survives fresh process',
        subsystem: 'stress', severity: 'CRITICAL', blocksV1: true,
        setup: 'Real PostgreSQL', steps: 'Create scoped key and verify it from a separate Node process',
        expected: 'The key verifier and scopes survive process restart',
        run: async () => {
            const created = await storage.createApiKey({ name: 'Qualification restart key', permissions: ['tasks:run'], taskIds: ['restart-task'] });
            try {
                isolated(`
                    const storage=require('./src/server/storage');
                    (async()=>{const k=await storage.verifyApiKey(process.env.QUALIFICATION_TEST_KEY);
                    if(!k||k.permissions.join()!=='tasks:run'||k.taskIds.join()!=='restart-task')process.exit(2);
                    })().then(()=>process.exit(0)).catch(e=>{console.error(e);process.exit(3)});
                `.replace('process.env.QUALIFICATION_TEST_KEY', JSON.stringify(created.secret)));
            } finally { await storage.revokeApiKey(created.key.id); }
        }
    },
    {
        id: 'STRESS-003', name: 'API key database write rollback retains prior keys',
        subsystem: 'stress', severity: 'CRITICAL', blocksV1: true,
        setup: 'Injected PostgreSQL INSERT failure in isolated process',
        steps: 'Force INSERT into api_keys to fail during key creation, verify rollback and preexisting verifier',
        expected: 'Creation rejects, existing key remains in DB and usable',
        run: async () => {
            isolated(`
                const storage=require('./src/server/storage'), db=require('./src/server/db');
                (async()=>{const before=await storage.createApiKey({name:'rollback baseline',permissions:['tasks:read'],taskIds:[]});
                try { const pool=await db.initDB(); const original=pool.connect.bind(pool);
                pool.connect=async()=>{const client=await original();const query=client.query.bind(client);
                client.query=(...args)=>String(args[0]).startsWith('INSERT INTO api_keys')?Promise.reject(Error('injected write failure')):query(...args);
                const release=client.release.bind(client);client.release=(...args)=>{client.query=query;client.release=release;return release(...args)};
                return client;};
                try {await storage.createApiKey({name:'must fail',permissions:['tasks:read'],taskIds:[]});throw Error('write unexpectedly succeeded');}
                catch(e){if(!/injected write failure/.test(e.message))throw e;}
                pool.connect=original;
                if(!(await storage.verifyApiKey(before.secret)))throw Error('baseline key lost after rollback');
                }finally{await storage.revokeApiKey(before.key.id);}
                })().then(()=>process.exit(0)).catch(e=>{console.error(e);process.exit(1)});
            `);
        }
    },
    {
        id: 'STRESS-004', name: 'Task save failure does not poison task cache',
        subsystem: 'stress', severity: 'CRITICAL', blocksV1: true,
        setup: 'Isolated database write fault', steps: 'Force TRUNCATE tasks failure and read back cached task IDs',
        expected: 'Failed write rejects and previous tasks remain available',
        run: async () => {
            isolated(`
                const storage=require('./src/server/storage'),db=require('./src/server/db');
                (async()=>{const before=await storage.loadTasks();const pool=await db.initDB();const original=pool.connect.bind(pool);
                pool.connect=async()=>{const client=await original();const query=client.query.bind(client);
                client.query=(...args)=>String(args[0]).includes('TRUNCATE tasks')?Promise.reject(Error('injected task write failure')):query(...args);
                const release=client.release.bind(client);client.release=(...args)=>{client.query=query;client.release=release;return release(...args)};return client;};
                try{await storage.saveTasks([...before,{id:'should-not-persist',name:'failure'}]);throw Error('write unexpectedly succeeded');}
                catch(e){if(!/injected task write failure/.test(e.message))throw e;}
                pool.connect=original;
                const after=await storage.loadTasks();
                if(after.some(t=>t.id==='should-not-persist'))throw Error('failed write polluted task cache');
                })().then(()=>process.exit(0)).catch(e=>{console.error(e);process.exit(1)});
            `);
        }
    },
    {
        id: 'STRESS-005', name: 'Concurrent scoped key reads and verification',
        subsystem: 'stress', severity: 'HIGH', blocksV1: true,
        setup: 'Scoped qualification key', steps: 'Verify the same key 20 times concurrently',
        expected: 'Every verifier returns identical metadata',
        run: async () => {
            const created = await storage.createApiKey({ name: 'Concurrency qualification', permissions: ['results:read'], taskIds: [] });
            try {
                const keys = await Promise.all(Array.from({ length: 20 }, () => storage.verifyApiKey(created.secret)));
                assert.equal(keys.length, 20);
                for (const key of keys) assert.equal(key.id, created.key.id);
            } finally { await storage.revokeApiKey(created.key.id); }
        }
    }
];
module.exports = { tests };
