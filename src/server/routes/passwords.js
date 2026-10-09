const express = require('express');
const { requireAuth, csrfProtection, dataRateLimiter } = require('../middleware');
const onepassword = require('../onepassword');
const { getPendingPasswordCapture, readPendingPasswordCapture, takePendingPasswordCapture } = require('../../../headful');
const router = express.Router();
router.get('/status', requireAuth, async (_req, res) => { const config = await onepassword.loadConfig(); res.json({ configured: !!config.token }); });
router.post('/configure', csrfProtection, dataRateLimiter, requireAuth, async (req, res) => {
    const token = String(req.body?.token || '').trim(); if (!token) return res.status(400).json({ error: 'TOKEN_REQUIRED' });
    const previous = await onepassword.loadConfig();
    try { await onepassword.saveConfig({ token }); const vault = await onepassword.ensureFigraniumVault(); res.json({ configured: true, vault: vault.title }); }
    catch { await onepassword.saveConfig(previous); res.status(400).json({ error: 'ONEPASSWORD_CONNECTION_FAILED' }); }
});
router.delete('/configure', csrfProtection, dataRateLimiter, requireAuth, async (_req, res) => { await onepassword.saveConfig({}); res.json({ configured: false }); });
router.get('/', requireAuth, async (_req, res) => { try { res.json({ items: await onepassword.listLogins() }); } catch (error) { res.status(400).json({ error: error.code || 'ONEPASSWORD_UNAVAILABLE' }); } });
router.get('/capture', requireAuth, async (_req, res) => {
    const config = await onepassword.loadConfig();
    res.json({ candidate: config.token ? getPendingPasswordCapture() : null });
});
router.post('/capture', csrfProtection, dataRateLimiter, requireAuth, async (req, res) => {
    const { id, decision } = req.body || {};
    if (!['save', 'dismiss'].includes(decision)) return res.status(400).json({ error: 'INVALID_DECISION' });
    const candidate = readPendingPasswordCapture(id);
    if (!candidate) return res.status(404).json({ error: 'CAPTURE_NOT_FOUND' });
    if (decision === 'dismiss') { takePendingPasswordCapture(id); return res.json({ ok: true }); }
    try { const result = await onepassword.saveLoginForDomain(candidate); takePendingPasswordCapture(id); res.json({ ok: true, result }); }
    catch (error) { res.status(502).json({ error: error.code || 'PASSWORD_SAVE_FAILED' }); }
});
module.exports = router;
