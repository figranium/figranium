const express = require('express');
const crypto = require('crypto');
const { requireAuthOrApiKey } = require('../middleware');
const { loadCredentials, saveCredentials } = require('../storage');
const { validateUrl, fetchWithRedirectValidation } = require('../../../url-utils');
const { normalizeBaserowTables } = require('../baserow-table-list');

const router = express.Router();

// GET /api/credentials
router.get('/', requireAuthOrApiKey, async (req, res) => {
    try {
        const credentials = await loadCredentials();
        // Redact tokens before sending to client
        const redacted = credentials.map(({ config, ...rest }) => ({
            ...rest,
            config: { ...config, token: config.token ? '••••••••' : '' }
        }));
        res.json(redacted);
    } catch (err) {
        res.status(500).json({ error: 'FAILED_TO_LOAD_CREDENTIALS' });
    }
});

// POST /api/credentials
router.post('/', requireAuthOrApiKey, async (req, res) => {
    const { name, provider, config } = req.body;
    if (!name || !provider || !config) {
        return res.status(400).json({ error: 'MISSING_FIELDS' });
    }
    if (provider !== 'baserow') {
        return res.status(400).json({ error: 'UNSUPPORTED_PROVIDER' });
    }
    if (!config.token || !config.baseUrl) {
        return res.status(400).json({ error: 'MISSING_CONFIG_FIELDS' });
    }
    try {
        await validateUrl(config.baseUrl);
    } catch (e) {
        return res.status(400).json({ error: 'INVALID_BASE_URL', details: 'Invalid base URL format or restricted destination' });
    }
    try {
        const credentials = await loadCredentials();
        const credential = {
            id: 'cred_' + crypto.randomBytes(8).toString('hex'),
            name: String(name).trim(),
            provider,
            config: {
                baseUrl: String(config.baseUrl).trim().replace(/\/$/, ''),
                token: String(config.token).trim()
            }
        };
        credentials.push(credential);
        await saveCredentials(credentials);
        const { config: cfg, ...rest } = credential;
        res.json({ ...rest, config: { ...cfg, token: '••••••••' } });
    } catch (err) {
        res.status(500).json({ error: 'FAILED_TO_SAVE_CREDENTIAL' });
    }
});

// PUT /api/credentials/:id
router.put('/:id', requireAuthOrApiKey, async (req, res) => {
    const { name, config } = req.body;
    if (config && config.baseUrl) {
        try {
            await validateUrl(config.baseUrl);
        } catch (e) {
            return res.status(400).json({ error: 'INVALID_BASE_URL', details: 'Invalid base URL format or restricted destination' });
        }
    }
    try {
        const credentials = await loadCredentials();
        const idx = credentials.findIndex(c => c.id === req.params.id);
        if (idx === -1) return res.status(404).json({ error: 'CREDENTIAL_NOT_FOUND' });

        if (name) credentials[idx].name = String(name).trim();
        if (config) {
            if (config.baseUrl) credentials[idx].config.baseUrl = String(config.baseUrl).trim().replace(/\/$/, '');
            // Only update token if a real value (not the redacted placeholder) is provided
            if (config.token && !config.token.includes('•')) {
                credentials[idx].config.token = String(config.token).trim();
            }
        }
        await saveCredentials(credentials);
        const { config: cfg, ...rest } = credentials[idx];
        res.json({ ...rest, config: { ...cfg, token: '••••••••' } });
    } catch (err) {
        res.status(500).json({ error: 'FAILED_TO_UPDATE_CREDENTIAL' });
    }
});

// Database tokens can enumerate their permitted tables through the Database API.
router.get('/:id/proxy/baserow/tables', requireAuthOrApiKey, async (req, res) => {
    try {
        const credential = (await loadCredentials()).find(c => c.id === req.params.id && c.provider === 'baserow');
        if (!credential) return res.status(404).json({ error: 'CREDENTIAL_NOT_FOUND' });
        const { baseUrl, token } = credential.config;
        await validateUrl(baseUrl);
        const resp = await fetchWithRedirectValidation(`${baseUrl}/api/database/tables/all-tables/`, {
            headers: { 'Authorization': `Token ${token}` }
        });
        if (!resp.ok) {
            return res.status(resp.status).json({ error: 'BASEROW_TABLES_FAILED', detail: `Baserow returned HTTP ${resp.status}. Check the database token and its read access.` });
        }
        const data = await resp.json();
        res.json(normalizeBaserowTables(data, { fallbackDatabaseName: credential.name }));
    } catch (err) {
        res.status(500).json({ error: 'PROXY_ERROR', detail: 'Internal proxy error' });
    }
});

router.get('/:id/proxy/baserow/tables/:tableId/fields', requireAuthOrApiKey, async (req, res) => {
    if (!/^\d+$/.test(req.params.tableId)) return res.status(400).json({ error: 'INVALID_TABLE_ID' });
    try {
        const credential = (await loadCredentials()).find(c => c.id === req.params.id && c.provider === 'baserow');
        if (!credential) return res.status(404).json({ error: 'CREDENTIAL_NOT_FOUND' });
        const { baseUrl, token } = credential.config;
        await validateUrl(baseUrl);
        const resp = await fetchWithRedirectValidation(`${baseUrl}/api/database/fields/table/${req.params.tableId}/`, {
            headers: { 'Authorization': `Token ${token}` }
        });
        if (!resp.ok) return res.status(resp.status).json({ error: 'BASEROW_FIELDS_FAILED', detail: `Baserow returned HTTP ${resp.status}. Check read access to this table.` });
        const data = await resp.json();
        res.json((Array.isArray(data) ? data : []).map(field => ({ name: field.name, type: field.type })));
    } catch (err) {
        res.status(500).json({ error: 'PROXY_ERROR', detail: 'Internal proxy error' });
    }
});

// DELETE /api/credentials/:id
router.delete('/:id', requireAuthOrApiKey, async (req, res) => {
    try {
        const credentials = await loadCredentials();
        const filtered = credentials.filter(c => c.id !== req.params.id);
        if (filtered.length === credentials.length) {
            return res.status(404).json({ error: 'CREDENTIAL_NOT_FOUND' });
        }
        await saveCredentials(filtered);
        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ error: 'FAILED_TO_DELETE_CREDENTIAL' });
    }
});

module.exports = router;
