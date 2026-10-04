const fs = require('fs');
const { API_KEY_FILE, CREDENTIALS_FILE } = require('./constants');

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
        const raw = await fs.promises.readFile(CREDENTIALS_FILE, 'utf8');
        credentialsCache = JSON.parse(raw);
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
    await fs.promises.writeFile(CREDENTIALS_FILE, JSON.stringify(credentials, null, 2));
}


return { loadApiKey, saveApiKey, loadCredentials, saveCredentials };
};
