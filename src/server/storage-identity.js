const fs = require('fs');
const crypto = require('crypto');
const { readSecretFile, writeSecretFile } = require('./secret-store');
const { API_KEY_FILE, API_KEYS_FILE, API_KEY_ARCHIVE_SECRET_FILE, CREDENTIALS_FILE } = require('./constants');

module.exports = function createIdentityStorage({ ensureDB, getPool, bulkInsert, loadUsers, saveUsers }) {
// API Key Storage
let apiKeyCache = undefined;
let apiKeyLoadPromise = null;

// Deployments that do not expose Figranium's web UI (for example a native host
// application) may provide a one-time bootstrap key as a mounted secret file.
// A persisted API key always wins, so changing or removing the file never
// rotates an already configured instance.
async function loadBootstrapApiKey() {
    const secretPath = process.env.FIGRANIUM_BOOTSTRAP_API_KEY_FILE;
    if (!secretPath) return null;

    try {
        const key = (await fs.promises.readFile(secretPath, 'utf8')).trim();
        return key.length >= 32 && key.length <= 512 ? key : null;
    } catch {
        return null;
    }
}

async function loadApiKey() {
    if (apiKeyCache !== undefined) return apiKeyCache;
    if (apiKeyLoadPromise) return apiKeyLoadPromise;

    apiKeyLoadPromise = (async () => {
        let apiKey = null;

        const useDB = await ensureDB();
        if (useDB) {
            try {
                const pool = getPool();
                if (!pool) throw new Error('Database pool not available');
                const res = await pool.query('SELECT key FROM api_key WHERE id = 1');
                if (res.rows.length > 0) apiKey = res.rows[0].key;
            } catch (e) {
                console.error('[STORAGE] loadApiKey DB error:', e.message);
            }
        } else {
            try {
                const raw = await fs.promises.readFile(API_KEY_FILE, 'utf8');
                const data = JSON.parse(raw);
                apiKey = data && data.apiKey ? data.apiKey : null;
            } catch (e) {
                apiKey = null;
            }
        }

        if (apiKeyCache !== undefined) {
            apiKeyLoadPromise = null;
            return apiKeyCache;
        }

        if (!apiKey) {
            apiKey = await loadBootstrapApiKey();
        }

        if (!apiKey) {
            try {
                // Now loadUsers is async
                const users = await loadUsers();
                if (Array.isArray(users) && users.length > 0 && users[0].apiKey) {
                    apiKey = users[0].apiKey;
                    await saveApiKey(apiKey);
                }
            } catch (e) {
                // ignore
            }
        }

        if (apiKeyCache !== undefined) {
            apiKeyLoadPromise = null;
            return apiKeyCache;
        }

        apiKeyCache = apiKey;
        apiKeyLoadPromise = null;
        return apiKey;
    })();

    return apiKeyLoadPromise;
}

async function saveApiKey(apiKeyArg) {
    const apiKey = typeof apiKeyArg === 'string' ? apiKeyArg.trim() : apiKeyArg;
    apiKeyCache = apiKey;
    const useDB = await ensureDB();
    if (useDB) {
        const pool = getPool();
        try {
            await pool.query('INSERT INTO api_key (id, key) VALUES (1, $1) ON CONFLICT (id) DO UPDATE SET key = EXCLUDED.key', [apiKey]);
        } catch (e) {
            console.error('[STORAGE] Failed to save API key to DB:', e.message);
        }
    } else {
        try {
            fs.writeFileSync(API_KEY_FILE, JSON.stringify({ apiKey }, null, 2));
        } catch (e) {
            console.error('[STORAGE] Failed to save API key to file:', e.message);
        }
    }

    // Try to update user with the new API key too
    try {
        const users = await loadUsers();
        if (Array.isArray(users) && users.length > 0) {
            users[0].apiKey = apiKey;
            await saveUsers(users);
        }
    } catch (e) { }
}

// Credentials Storage
let credentialsCache = null;

async function loadCredentials() {
    if (credentialsCache) return credentialsCache;
    const useDB = await ensureDB();
    if (useDB) {
        try {
            const pool = getPool();
            if (!pool) throw new Error('Database pool not available');
            const res = await pool.query('SELECT data FROM credentials ORDER BY id ASC');
            credentialsCache = res.rows.map(r => r.data);
        } catch (e) {
            console.error('[STORAGE] Failed to load credentials from DB:', e.message);
            credentialsCache = [];
        }
        return credentialsCache;
    }
    try {
        credentialsCache = await readSecretFile(CREDENTIALS_FILE, 'credentials', []);
    } catch {
        credentialsCache = [];
    }
    return credentialsCache;
}

async function saveCredentials(credentials) {
    credentialsCache = credentials;
    const useDB = await ensureDB();
    if (useDB) {
        const pool = getPool();
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            await client.query('TRUNCATE credentials');
            const rows = credentials.map((data, i) => ({ id: i + 1, data }));
            await bulkInsert(client, 'credentials', ['id', 'data'], rows);
            await client.query('COMMIT');
        } catch (e) {
            await client.query('ROLLBACK');
            console.error('[STORAGE] Failed to save credentials to DB:', e.message);
        } finally {
            client.release();
        }
        return;
    }
    await writeSecretFile(CREDENTIALS_FILE, 'credentials', credentials);
}

// Named API keys are stored as salted hashes. The clear-text key only exists at
// creation time, and the pre-scoped key is migrated once as a full-access key.
let apiKeysCache = null;
const API_KEY_PERMISSIONS = ['tasks:read', 'tasks:run', 'results:read', 'tasks:manage'];
let archiveKeyPromise = null;

async function getArchiveKey() {
    if (!archiveKeyPromise) archiveKeyPromise = (async () => {
        let value = '';
        try { value = (await fs.promises.readFile(API_KEY_ARCHIVE_SECRET_FILE, 'utf8')).trim(); } catch { }
        if (!value) {
            value = crypto.randomBytes(32).toString('base64url');
            await fs.promises.mkdir(require('path').dirname(API_KEY_ARCHIVE_SECRET_FILE), { recursive: true });
            await fs.promises.writeFile(API_KEY_ARCHIVE_SECRET_FILE, value, { mode: 0o600 });
        }
        return crypto.createHash('sha256').update(value).digest();
    })();
    return archiveKeyPromise;
}

async function encryptExportSecret(secret) {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', await getArchiveKey(), iv);
    const ciphertext = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
    return { iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), ciphertext: ciphertext.toString('base64') };
}

async function decryptExportSecret(value) {
    if (!value?.iv || !value?.tag || !value?.ciphertext) return null;
    try {
        const decipher = crypto.createDecipheriv('aes-256-gcm', await getArchiveKey(), Buffer.from(value.iv, 'base64'));
        decipher.setAuthTag(Buffer.from(value.tag, 'base64'));
        return Buffer.concat([decipher.update(Buffer.from(value.ciphertext, 'base64')), decipher.final()]).toString('utf8');
    } catch { return null; }
}

function hashApiKey(value, salt = crypto.randomBytes(16).toString('hex')) {
    return new Promise((resolve, reject) => crypto.scrypt(value, salt, 64, (err, derived) => {
        if (err) reject(err); else resolve({ salt, hash: derived.toString('hex') });
    }));
}

async function readApiKeys() {
    const useDB = await ensureDB();
    if (useDB) {
        const pool = getPool();
        const result = await pool.query('SELECT data FROM api_keys ORDER BY created_at ASC');
        return result.rows.map(row => row.data);
    }
    try { return JSON.parse(await fs.promises.readFile(API_KEYS_FILE, 'utf8')); } catch { return []; }
}

async function persistApiKeys(keys) {
    apiKeysCache = keys;
    const useDB = await ensureDB();
    if (useDB) {
        const pool = getPool();
        await pool.query('DELETE FROM api_keys');
        for (const key of keys) await pool.query('INSERT INTO api_keys (id, data, created_at) VALUES ($1, $2, $3)', [key.id, key, key.createdAt]);
        return;
    }
    await fs.promises.writeFile(API_KEYS_FILE, JSON.stringify(keys, null, 2));
}

async function loadApiKeys() {
    if (apiKeysCache) return apiKeysCache;
    const keys = await readApiKeys();
    if (keys.length) return (apiKeysCache = keys);
    const legacy = await loadApiKey();
    if (!legacy) return (apiKeysCache = []);
    const hashed = await hashApiKey(legacy);
    const migrated = [{ id: `key_${crypto.randomBytes(8).toString('hex')}`, name: 'Legacy full access key', ...hashed, exportSecret: await encryptExportSecret(legacy),
        permissions: API_KEY_PERMISSIONS, taskIds: [], createdAt: new Date().toISOString(), legacy: true }];
    await persistApiKeys(migrated);
    return migrated;
}

async function createApiKey({ name, permissions, taskIds }) {
    const validPermissions = [...new Set((Array.isArray(permissions) ? permissions : []).filter(p => API_KEY_PERMISSIONS.includes(p)))];
    if (!validPermissions.length) throw new Error('PERMISSIONS_REQUIRED');
    const secret = crypto.randomBytes(32).toString('base64url');
    const hashed = await hashApiKey(secret);
    const key = { id: `key_${crypto.randomBytes(8).toString('hex')}`, name: String(name || 'API key').trim().slice(0, 120) || 'API key', ...hashed, exportSecret: await encryptExportSecret(secret),
        permissions: validPermissions,
        taskIds: [...new Set((taskIds || []).map(String))], createdAt: new Date().toISOString() };
    const keys = await loadApiKeys();
    await persistApiKeys([...keys, key]);
    return { key, secret };
}

async function revokeApiKey(id) {
    const keys = await loadApiKeys();
    const next = keys.filter(key => key.id !== id);
    if (next.length === keys.length) return false;
    await persistApiKeys(next);
    return true;
}

async function clearApiKeys() { await persistApiKeys([]); }

function publicApiKeyMetadata(key) {
    return {
        id: key.id,
        name: key.name,
        permissions: Array.isArray(key.permissions) ? key.permissions.filter(permission => API_KEY_PERMISSIONS.includes(permission)) : [],
        taskIds: Array.isArray(key.taskIds) ? key.taskIds.map(String) : [],
        createdAt: key.createdAt,
        legacy: !!key.legacy
    };
}

async function importApiKeyMetadata(records) {
    if (!Array.isArray(records)) return;
    const existing = await loadApiKeys();
    const existingIds = new Set(existing.map(key => key.id));
    const imported = records
        .filter(record => record && typeof record === 'object' && typeof record.id === 'string')
        .filter(record => !existingIds.has(record.id))
        .map(record => ({
            ...publicApiKeyMetadata(record),
            // There is deliberately no verifier or secret in an archive. These
            // records remain visible as integration inventory only.
            imported: true,
            disabled: true
        }));
    if (imported.length) await persistApiKeys([...existing, ...imported]);
}

async function exportApiKeys() {
    const legacySecret = await loadApiKey();
    return Promise.all((await loadApiKeys()).map(async key => ({
        ...publicApiKeyMetadata(key),
        secret: key.legacy ? legacySecret : await decryptExportSecret(key.exportSecret)
    })));
}

async function importApiKeys(records) {
    if (!Array.isArray(records)) throw new Error('Invalid API keys');
    const keys = [];
    let legacySecret = null;
    for (const record of records) {
        if (!record || typeof record !== 'object' || typeof record.id !== 'string') continue;
        const metadata = publicApiKeyMetadata(record);
        const secret = typeof record.secret === 'string' ? record.secret : null;
        if (!secret) {
            keys.push({ ...metadata, imported: true, disabled: true });
            continue;
        }
        const hashed = await hashApiKey(secret);
        const key = { ...metadata, ...hashed, exportSecret: await encryptExportSecret(secret) };
        keys.push(key);
        if (key.legacy) legacySecret = secret;
    }
    await persistApiKeys(keys);
    await saveApiKey(legacySecret);
}

async function verifyApiKey(secret) {
    if (!secret || typeof secret !== 'string') return null;
    const keys = await loadApiKeys();
    for (const key of keys) {
        if (!key.hash || !key.salt || key.disabled) continue;
        const { hash } = await hashApiKey(secret, key.salt);
        const a = Buffer.from(hash, 'hex'); const b = Buffer.from(key.hash, 'hex');
        if (a.length === b.length && crypto.timingSafeEqual(a, b)) return key;
    }
    return null;
}


return { loadApiKey, saveApiKey, loadApiKeys, createApiKey, revokeApiKey, clearApiKeys, importApiKeyMetadata, importApiKeys, exportApiKeys, publicApiKeyMetadata, verifyApiKey, loadCredentials, saveCredentials, API_KEY_PERMISSIONS };
};
