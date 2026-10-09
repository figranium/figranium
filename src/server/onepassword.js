const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { readSecretFile, writeSecretFile } = require('./secret-store');
const { ONEPASSWORD_FILE, PASSWORD_CACHE_FILE, PASSWORD_CACHE_KEY_FILE } = require('./constants');

const LOGIN_CACHE_TTL_MS = 15_000;
const LOGIN_FETCH_CONCURRENCY = 6;
const PERSISTED_LOGIN_CACHE_TTL_MS = 30 * 60 * 1000;
const PERSISTED_PASSWORD_CACHE_TTL_MS = 10 * 60 * 1000;
const PASSWORD_CACHE_ENABLED = !['0', 'false', 'no'].includes(String(process.env.PASSWORD_CACHE_ENABLED || 'true').toLowerCase());
let loginCache = null;
let loginListInFlight = null;
let persistentCache = null;
let persistentCachePromise = null;
let passwordCacheKeyPromise = null;

async function loadConfig() { return readSecretFile(ONEPASSWORD_FILE, 'onepassword-config', {}); }
async function saveConfig(config) { await writeSecretFile(ONEPASSWORD_FILE, 'onepassword-config', config); await invalidateLoginCache(); }
async function getPasswordCacheKey() {
    if (!passwordCacheKeyPromise) passwordCacheKeyPromise = (async () => {
        if (process.env.PASSWORD_CACHE_KEY) return crypto.createHash('sha256').update(process.env.PASSWORD_CACHE_KEY).digest();
        try {
            const key = await fs.promises.readFile(PASSWORD_CACHE_KEY_FILE);
            if (key.length === 32) return key;
        } catch { /* Create a new key below. */ }
        const key = crypto.randomBytes(32);
        await fs.promises.mkdir(path.dirname(PASSWORD_CACHE_KEY_FILE), { recursive: true });
        await fs.promises.writeFile(PASSWORD_CACHE_KEY_FILE, key, { mode: 0o600 });
        return key;
    })();
    return passwordCacheKeyPromise;
}
function encryptCache(value, key) {
    const iv = crypto.randomBytes(12); const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const encrypted = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
    return { version: 1, iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), ciphertext: encrypted.toString('base64') };
}
function decryptCache(value, key) {
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(value.iv, 'base64'));
    decipher.setAuthTag(Buffer.from(value.tag, 'base64'));
    return JSON.parse(Buffer.concat([decipher.update(Buffer.from(value.ciphertext, 'base64')), decipher.final()]).toString('utf8'));
}
function emptyPersistentCache() { return { logins: null, loginsSavedAt: 0, passwords: {} }; }
async function loadPersistentCache() {
    if (!PASSWORD_CACHE_ENABLED) return emptyPersistentCache();
    if (persistentCache) return persistentCache;
    if (!persistentCachePromise) persistentCachePromise = (async () => {
        try {
            const [key, raw] = await Promise.all([getPasswordCacheKey(), fs.promises.readFile(PASSWORD_CACHE_FILE, 'utf8')]);
            persistentCache = decryptCache(JSON.parse(raw), key);
        } catch { persistentCache = emptyPersistentCache(); }
        return persistentCache;
    })().finally(() => { persistentCachePromise = null; });
    return persistentCachePromise;
}
async function savePersistentCache(cache) {
    if (!PASSWORD_CACHE_ENABLED) return;
    persistentCache = cache;
    const key = await getPasswordCacheKey();
    const encrypted = encryptCache(cache, key);
    await fs.promises.mkdir(path.dirname(PASSWORD_CACHE_FILE), { recursive: true });
    const temporary = `${PASSWORD_CACHE_FILE}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`;
    await fs.promises.writeFile(temporary, JSON.stringify(encrypted), { mode: 0o600 });
    await fs.promises.rename(temporary, PASSWORD_CACHE_FILE);
}
async function client() {
    const config = await loadConfig();
    if (!config.token) throw Object.assign(new Error('1Password is not configured'), { code: 'ONEPASSWORD_NOT_CONFIGURED' });
    const sdk = await import('@1password/sdk');
    return sdk.createClient({ auth: config.token, integrationName: 'Figranium', integrationVersion: '0.20.0' });
}
function selectFigraniumVault(vaults, configuredVaultId) {
    return vaults.find(candidate => candidate.title === 'Figranium')
        || vaults.find(candidate => candidate.id === configuredVaultId)
        || null;
}
async function ensureFigraniumVault() {
    const config = await loadConfig();
    const op = await client();
    const vaults = await op.vaults.list();
    let vault = selectFigraniumVault(vaults, config.vaultId);
    if (!vault) vault = await op.vaults.create({ title: 'Figranium', description: 'Credentials used by Figranium automations.' });
    if (config.vaultId !== vault.id || config.vaultTitle !== vault.title) {
        await saveConfig({ ...config, vaultId: vault.id, vaultTitle: vault.title });
    }
    return vault;
}
function websiteDomains(item) {
    return Array.from(new Set((item.websites || []).flatMap(website => {
        try {
            return [new URL(website.url).hostname.toLowerCase()];
        } catch {
            return [];
        }
    })));
}
async function invalidateLoginCache() {
    loginCache = null;
    persistentCache = emptyPersistentCache();
    await savePersistentCache(persistentCache);
}
async function mapWithConcurrency(items, limit, mapper) {
    const results = new Array(items.length);
    let nextIndex = 0;
    await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
        while (nextIndex < items.length) {
            const index = nextIndex++;
            results[index] = await mapper(items[index]);
        }
    }));
    return results;
}
async function fetchLogins() {
    const op = await client(); const vault = await ensureFigraniumVault();
    const items = await op.items.list(vault.id);
    const rows = await mapWithConcurrency(items.filter(item => item.category === 'Login'), LOGIN_FETCH_CONCURRENCY, async overview => {
        const item = await op.items.get(vault.id, overview.id);
        const username = item.fields.find(field => field.title.toLowerCase() === 'username')?.value || '';
        const hasPassword = item.fields.some(field => field.title.toLowerCase() === 'password');
        return { id: item.id, vaultId: vault.id, vault: vault.title, title: item.title, username, hasPassword, domains: websiteDomains(item) };
    });
    const cache = await loadPersistentCache();
    await savePersistentCache({ ...cache, logins: rows, loginsSavedAt: Date.now() });
    return rows;
}
async function listLogins() {
    if (PASSWORD_CACHE_ENABLED && loginCache?.expiresAt > Date.now()) return loginCache.rows;
    const cache = await loadPersistentCache();
    if (PASSWORD_CACHE_ENABLED && Array.isArray(cache.logins) && Date.now() - cache.loginsSavedAt < PERSISTED_LOGIN_CACHE_TTL_MS) {
        loginCache = { rows: cache.logins, expiresAt: Date.now() + LOGIN_CACHE_TTL_MS };
        return loginCache.rows;
    }
    if (!loginListInFlight) {
        loginListInFlight = fetchLogins()
            .then(rows => {
                if (PASSWORD_CACHE_ENABLED) loginCache = { rows, expiresAt: Date.now() + LOGIN_CACHE_TTL_MS };
                return rows;
            })
            .finally(() => { loginListInFlight = null; });
    }
    return loginListInFlight;
}
function findPasswordLoginForDomain(logins, normalizedDomain) {
    const matchingItems = logins.filter(item => item.domains.includes(normalizedDomain));
    const passwordItems = matchingItems.filter(item => item.hasPassword);
    if (passwordItems.length > 1) {
        throw Object.assign(new Error('Multiple 1Password Login items match this domain'), { code: 'AMBIGUOUS_PASSWORD_DOMAIN' });
    }
    if (passwordItems.length === 0) {
        const code = matchingItems.length ? 'PASSWORD_NOT_FOUND' : 'PASSWORD_DOMAIN_NOT_FOUND';
        throw Object.assign(new Error('No 1Password Login password matches this domain'), { code });
    }
    return passwordItems[0];
}
function findUsernameLoginForDomain(logins, normalizedDomain) {
    const matchingItems = logins.filter(item => item.domains.includes(normalizedDomain));
    const usernameItems = matchingItems.filter(item => item.username);
    if (usernameItems.length > 1) {
        throw Object.assign(new Error('Multiple 1Password Login items match this domain'), { code: 'AMBIGUOUS_PASSWORD_DOMAIN' });
    }
    if (usernameItems.length === 0) {
        const code = matchingItems.length ? 'USERNAME_NOT_FOUND' : 'PASSWORD_DOMAIN_NOT_FOUND';
        throw Object.assign(new Error('No 1Password Login username matches this domain'), { code });
    }
    return usernameItems[0];
}
async function getPasswordForDomain(domain, dependencies = {}) {
    const normalizedDomain = String(domain || '').toLowerCase();
    if (!/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)(?:\.(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?))*$/.test(normalizedDomain)) {
        throw Object.assign(new Error('Invalid password variable domain'), { code: 'INVALID_PASSWORD_DOMAIN' });
    }
    const logins = await (dependencies.listLogins || listLogins)();
    const login = findPasswordLoginForDomain(logins, normalizedDomain);
    return (dependencies.getPassword || getPassword)(login.vaultId, login.id);
}
async function getUsernameForDomain(domain, dependencies = {}) {
    const normalizedDomain = String(domain || '').toLowerCase();
    if (!/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)(?:\.(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?))*$/.test(normalizedDomain)) {
        throw Object.assign(new Error('Invalid username variable domain'), { code: 'INVALID_PASSWORD_DOMAIN' });
    }
    const logins = await (dependencies.listLogins || listLogins)();
    return findUsernameLoginForDomain(logins, normalizedDomain).username;
}
async function getPassword(vaultId, itemId) {
    const cache = await loadPersistentCache();
    const cachedPassword = cache.passwords?.[`${vaultId}:${itemId}`];
    if (PASSWORD_CACHE_ENABLED && cachedPassword && Date.now() - cachedPassword.savedAt < PERSISTED_PASSWORD_CACHE_TTL_MS) return cachedPassword.value;
    const vault = await ensureFigraniumVault();
    if (vault.id !== vaultId) throw Object.assign(new Error('Item is outside the Figranium vault'), { code: 'VAULT_ACCESS_DENIED' });
    const op = await client(); const item = await op.items.get(vaultId, itemId);
    const field = item.fields.find(value => value.title.toLowerCase() === 'password');
    if (!field?.value) throw Object.assign(new Error('Password field not found'), { code: 'PASSWORD_NOT_FOUND' });
    await savePersistentCache({ ...cache, passwords: { ...cache.passwords, [`${vaultId}:${itemId}`]: { value: field.value, savedAt: Date.now() } } });
    return field.value;
}
async function saveLoginForDomain({ domain, url, username, password }, dependencies = {}) {
    const vault = await (dependencies.ensureFigraniumVault || ensureFigraniumVault)();
    const op = await (dependencies.client || client)();
    const logins = await (dependencies.listLogins || listLogins)();
    const matches = logins.filter(item => item.domains.includes(domain) && item.username === username);
    if (matches.length > 1) throw Object.assign(new Error('Multiple matching Login items'), { code: 'AMBIGUOUS_PASSWORD_DOMAIN' });
    if (matches.length === 1) {
        const item = await op.items.get(vault.id, matches[0].id);
        const field = item.fields.find(value => value.title.toLowerCase() === 'password');
        if (field) field.value = password;
        else item.fields.push({ id: 'password', title: 'password', fieldType: 'Concealed', value: password });
        const usernameField = item.fields.find(value => value.title.toLowerCase() === 'username');
        if (usernameField) usernameField.value = username;
        else item.fields.push({ id: 'username', title: 'username', fieldType: 'Text', value: username });
        await op.items.put(item);
        await (dependencies.invalidateLoginCache || invalidateLoginCache)();
        return 'updated';
    }
    await op.items.create({
        category: 'Login', vaultId: vault.id, title: domain,
        fields: [
            { id: 'username', title: 'username', fieldType: 'Text', value: username },
            { id: 'password', title: 'password', fieldType: 'Concealed', value: password }
        ],
        websites: [{ url, label: 'website', autofillBehavior: 'ExactDomain' }]
    });
    await (dependencies.invalidateLoginCache || invalidateLoginCache)();
    return 'created';
}
module.exports = { loadConfig, saveConfig, client, ensureFigraniumVault, selectFigraniumVault, listLogins, getPassword, getPasswordForDomain, getUsernameForDomain, saveLoginForDomain, websiteDomains, findPasswordLoginForDomain, findUsernameLoginForDomain, mapWithConcurrency, invalidateLoginCache, encryptCache, decryptCache, PASSWORD_CACHE_ENABLED };
