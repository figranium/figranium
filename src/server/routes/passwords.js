const express = require('express');
const { requireAuth, csrfProtection, dataRateLimiter } = require('../middleware');
const onepassword = require('../onepassword');
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
router.post('/:vaultId/:itemId/copy', csrfProtection, dataRateLimiter, requireAuth, async (req, res) => { try { res.json({ value: await onepassword.getPassword(req.params.vaultId, req.params.itemId) }); } catch (error) { res.status(404).json({ error: error.code || 'PASSWORD_NOT_FOUND' }); } });
module.exports = router;
