const express = require('express');
const { requireAuth, csrfProtection, dataRateLimiter } = require('../middleware');
const { loadApiKeys, loadApiKey, createApiKey, renameApiKey, revokeApiKey, API_KEY_PERMISSIONS } = require('../storage');

const router = express.Router();
const publicKey = ({ hash, salt, exportSecret, ...key }) => key;

router.get('/', requireAuth, async (_req, res) => {
    try {
        const keys = await loadApiKeys();
        const legacySecret = keys.some(key => key.legacy) ? await loadApiKey() : null;
        res.json({ keys: keys.map(publicKey), legacySecret, permissions: API_KEY_PERMISSIONS });
    }
    catch { res.status(500).json({ error: 'API_KEYS_LOAD_FAILED' }); }
});

router.post('/', csrfProtection, dataRateLimiter, requireAuth, async (req, res) => {
    const { name, permissions, taskIds } = req.body || {};
    if (!Array.isArray(permissions) || !permissions.some(permission => API_KEY_PERMISSIONS.includes(permission))) return res.status(400).json({ error: 'PERMISSIONS_REQUIRED' });
    try {
        const { key, secret } = await createApiKey({ name, permissions, taskIds });
        res.status(201).json({ key: publicKey(key), secret });
    } catch { res.status(500).json({ error: 'API_KEY_CREATE_FAILED' }); }
});

router.patch('/:id', csrfProtection, dataRateLimiter, requireAuth, async (req, res) => {
    try {
        const key = await renameApiKey(req.params.id, req.body?.name);
        res.json({ key: publicKey(key) });
    } catch (error) {
        const statuses = { INVALID_API_KEY_NAME: 400, API_KEY_NOT_FOUND: 404, LEGACY_API_KEY: 403 };
        res.status(statuses[error.message] || 500).json({ error: statuses[error.message] ? error.message : 'API_KEY_RENAME_FAILED' });
    }
});

router.delete('/:id', csrfProtection, dataRateLimiter, requireAuth, async (req, res) => {
    try {
        if (!await revokeApiKey(req.params.id)) return res.status(404).json({ error: 'API_KEY_NOT_FOUND' });
        res.json({ ok: true });
    } catch { res.status(500).json({ error: 'API_KEY_REVOKE_FAILED' }); }
});

module.exports = router;
