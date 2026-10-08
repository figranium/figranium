const express = require('express');
const { requireAuth, csrfProtection, dataRateLimiter } = require('../middleware');
const { loadSharedBrowserState } = require('../../../browser-storage-state');
const states = require('../cookie-states');
const router = express.Router();

router.get('/', requireAuth, async (_req, res) => res.json({ states: await states.listCookieStates() }));
router.get('/:id', requireAuth, async (req, res) => { const item = await states.getCookieState(req.params.id); if (!item) return res.status(404).json({ error: 'COOKIE_STATE_NOT_FOUND' }); res.json({ ...states.publicState(item), state: item.state }); });
router.post('/', csrfProtection, dataRateLimiter, requireAuth, async (req, res) => {
    const source = req.body?.state || { cookies: [], origins: [] };
    if (!Array.isArray(source.cookies)) return res.status(400).json({ error: 'COOKIE_STATE_REQUIRED' });
    const item = await states.createCookieState(req.body?.name, source); res.status(201).json(states.publicState(item));
});
router.patch('/:id', csrfProtection, dataRateLimiter, requireAuth, async (req, res) => {
    const item = req.body?.state ? await states.updateCookieState(req.params.id, req.body.state) : await states.renameCookieState(req.params.id, req.body?.name);
    if (!item) return res.status(404).json({ error: 'COOKIE_STATE_NOT_FOUND' }); res.json(states.publicState(item));
});
router.delete('/:id', csrfProtection, dataRateLimiter, requireAuth, async (req, res) => { if (!await states.deleteCookieState(req.params.id)) return res.status(404).json({ error: 'COOKIE_STATE_NOT_FOUND' }); res.json({ ok: true }); });
module.exports = router;
