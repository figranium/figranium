const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const crypto = require('node:crypto');
const storage = require('../../../src/server/storage');
const db = require('../../../src/server/db');

function isolatedSecretStore(script, setup = () => {}) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'figranium-key-qualification-'));
    try {
        setup(dir);
        const result = spawnSync(process.execPath, ['-e', script], {
            cwd: path.resolve(__dirname, '../../..'),
            env: { ...process.env, MASTER_KEY: '', MASTER_KEY_FILE: path.join(dir, 'master.key'), TEST_SECRET_DIR: dir },
            encoding: 'utf8', timeout: 10000
        });
        assert.equal(result.status, 0, result.stderr || result.stdout);
        return { stdout: result.stdout.trim(), dir };
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
}

const tests = [
    {
        id: 'RELIABILITY-001', name: 'Master key survives independent process restarts',
        subsystem: 'reliability', severity: 'CRITICAL', blocksV1: true,
        setup: 'Isolated key path', steps: 'Generate key and reopen it in a fresh process',
        expected: 'Master key is durable and unchanged across processes',
        run: async () => {
            const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'figranium-restart-'));
            try {
                const script = "require('./src/server/secret-store').masterKey().then(k=>process.stdout.write(k.toString('hex'))).catch(e=>{console.error(e);process.exit(1)})";
                const run = () => spawnSync(process.execPath, ['-e', script], { cwd: path.resolve(__dirname, '../../..'), env: { ...process.env, MASTER_KEY: '', MASTER_KEY_FILE: path.join(dir, 'master.key') }, encoding: 'utf8', timeout: 10000 });
                const first = run(), second = run();
                assert.equal(first.status, 0, first.stderr);
                assert.equal(second.status, 0, second.stderr);
                assert.match(first.stdout, /^[a-f0-9]{64}$/);
                assert.equal(first.stdout, second.stdout);
                assert.equal(fs.statSync(path.join(dir, 'master.key')).size, 32);
            } finally { fs.rmSync(dir, { recursive: true, force: true }); }
        }
    },
    {
        id: 'RELIABILITY-002', name: 'Corrupt master key is rejected without replacement',
        subsystem: 'reliability', severity: 'CRITICAL', blocksV1: true,
        setup: 'Corrupt isolated key file', steps: 'Attempt to load a truncated master key',
        expected: 'Rejects invalid key and preserves existing bytes',
        run: async () => {
            const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'figranium-corrupt-'));
            try {
                const file = path.join(dir, 'master.key');
                fs.writeFileSync(file, 'invalid');
                const script = "require('./src/server/secret-store').masterKey().then(()=>process.exit(2)).catch(e=>{if(!/Invalid encryption master key/.test(e.message))process.exit(3)})";
                const r = spawnSync(process.execPath, ['-e', script], { cwd: path.resolve(__dirname, '../../..'), env: { ...process.env, MASTER_KEY: '', MASTER_KEY_FILE: file }, encoding: 'utf8', timeout: 10000 });
                assert.equal(r.status, 0, r.stderr);
                assert.equal(fs.readFileSync(file, 'utf8'), 'invalid');
            } finally { fs.rmSync(dir, { recursive: true, force: true }); }
        }
    },
    {
        id: 'RELIABILITY-003', name: 'Encrypted secret cannot be opened with wrong key',
        subsystem: 'reliability', severity: 'CRITICAL', blocksV1: true,
        setup: 'Ephemeral envelope', steps: 'Encrypt and tamper with authentication tag',
        expected: 'Authenticated decryption fails closed',
        run: async () => {
            const { seal, open } = require('../../../src/server/secret-store');
            const key = crypto.randomBytes(32);
            const envelope = seal({ token: 'qualification' }, key, 'qualification');
            assert.deepEqual(open(envelope, key, 'qualification'), { token: 'qualification' });
            assert.throws(() => open(envelope, crypto.randomBytes(32), 'qualification'));
            const tampered = { ...envelope, tag: crypto.randomBytes(16).toString('base64') };
            assert.throws(() => open(tampered, key, 'qualification'));
        }
    },
    {
        id: 'RELIABILITY-004', name: 'Concurrent task reads preserve data',
        subsystem: 'reliability', severity: 'HIGH', blocksV1: true,
        setup: 'Existing qualification storage', steps: 'Read task collection in parallel 30 times',
        expected: 'Every read returns consistent task IDs',
        run: async () => {
            const snapshots = await Promise.all(Array.from({ length: 30 }, () => storage.loadTasks()));
            const baseline = snapshots[0].map(t => t.id).sort();
            for (const snapshot of snapshots) assert.deepEqual(snapshot.map(t => t.id).sort(), baseline);
        }
    },
    {
        id: 'RELIABILITY-005', name: 'Database task read errors do not masquerade as empty lists',
        subsystem: 'reliability', severity: 'CRITICAL', blocksV1: true,
        setup: 'Isolated injected database query failure', steps: 'Force SELECT tasks to fail after cache expiration',
        expected: 'The caller receives an error, not an empty task list',
        run: async () => {
            // Inject in a separate process to avoid modifying shared qualification state.
            const script = `
                const db=require('./src/server/db'), storage=require('./src/server/storage');
                (async()=>{const pool=await db.initDB();if(!pool)throw Error('Postgres unavailable');
                const original=pool.query.bind(pool);
                pool.query=(...args)=>String(args[0]).includes('SELECT data FROM tasks')?Promise.reject(Error('injected task read failure')):original(...args);
                await new Promise(r=>setTimeout(r,1200));
                try{await storage.loadTasks();process.exit(2)}catch(e){process.exit(/injected task read failure/.test(e.message)?0:3)}
                })().catch(e=>{console.error(e);process.exit(4)});
            `;
            const r = spawnSync(process.execPath, ['-e', script], { cwd: path.resolve(__dirname, '../../..'), env: process.env, encoding: 'utf8', timeout: 15000 });
            assert.equal(r.status, 0, r.stderr || r.stdout);
        }
    }
];
module.exports = { tests };
