const fs = require('fs');
const path = require('path');
const { ONEPASSWORD_FILE } = require('./constants');

async function loadConfig() { try { return JSON.parse(await fs.promises.readFile(ONEPASSWORD_FILE, 'utf8')); } catch { return {}; } }
async function saveConfig(config) { await fs.promises.mkdir(path.dirname(ONEPASSWORD_FILE), { recursive: true }); await fs.promises.writeFile(ONEPASSWORD_FILE, JSON.stringify(config, null, 2), { mode: 0o600 }); }
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
async function listLogins() {
    const op = await client(); const vault = await ensureFigraniumVault(); const rows = [];
    const items = await op.items.list(vault.id);
    for (const overview of items.filter(item => item.category === 'Login')) {
        const item = await op.items.get(vault.id, overview.id);
        const username = item.fields.find(field => field.title.toLowerCase() === 'username')?.value || '';
        const hasPassword = item.fields.some(field => field.title.toLowerCase() === 'password');
        rows.push({ id: item.id, vaultId: vault.id, vault: vault.title, title: item.title, username, hasPassword, domains: websiteDomains(item) });
    }
    return rows;
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
async function getPasswordForDomain(domain, dependencies = {}) {
    const normalizedDomain = String(domain || '').toLowerCase();
    if (!/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)(?:\.(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?))*$/.test(normalizedDomain)) {
        throw Object.assign(new Error('Invalid password variable domain'), { code: 'INVALID_PASSWORD_DOMAIN' });
    }
    const logins = await (dependencies.listLogins || listLogins)();
    const login = findPasswordLoginForDomain(logins, normalizedDomain);
    return (dependencies.getPassword || getPassword)(login.vaultId, login.id);
}
async function getPassword(vaultId, itemId) {
    const vault = await ensureFigraniumVault();
    if (vault.id !== vaultId) throw Object.assign(new Error('Item is outside the Figranium vault'), { code: 'VAULT_ACCESS_DENIED' });
    const op = await client(); const item = await op.items.get(vaultId, itemId);
    const field = item.fields.find(value => value.title.toLowerCase() === 'password');
    if (!field?.value) throw Object.assign(new Error('Password field not found'), { code: 'PASSWORD_NOT_FOUND' });
    return field.value;
}
module.exports = { loadConfig, saveConfig, client, ensureFigraniumVault, selectFigraniumVault, listLogins, getPassword, getPasswordForDomain, websiteDomains, findPasswordLoginForDomain };
