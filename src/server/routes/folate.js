const express = require('express');
const { requireAuthOrApiKey, requireScopedPermission, dataRateLimiter } = require('../middleware');
const { resolveWithFolate, getFolateStatus } = require('../../agent/figranite/folate-client');

const router = express.Router();

const MAX_QUERY_CHARS = 1000;
const MAX_HTML_CHARS = 5 * 1024 * 1024;

router.get('/status', requireAuthOrApiKey, requireScopedPermission('tasks:read'), async (_req, res) => {
    try {
        const status = await getFolateStatus();
        res.json(status);
    } catch (error) {
        res.status(500).json({ error: error.message || 'FOLATE_STATUS_FAILED' });
    }
});

router.post('/resolve', requireAuthOrApiKey, requireScopedPermission('tasks:run'), dataRateLimiter, async (req, res) => {
    try {
        const query = typeof req.body?.query === 'string' ? req.body.query.trim() : '';
        const html = typeof req.body?.html === 'string' ? req.body.html : '';
        if (!query || query.length > MAX_QUERY_CHARS) {
            return res.status(400).json({ error: 'FOLATE_QUERY_INVALID' });
        }
        if (!html.trim() || html.length > MAX_HTML_CHARS) {
            return res.status(400).json({ error: 'FOLATE_HTML_INVALID' });
        }

        const rawTopK = req.body?.topK ?? req.body?.top_k;
        const topK = rawTopK === undefined ? 3 : Number(rawTopK);
        if (!Number.isInteger(topK) || topK < 1 || topK > 20) {
            return res.status(400).json({ error: 'FOLATE_TOP_K_INVALID' });
        }

        const rawMaxCandidates = req.body?.maxCandidates ?? req.body?.max_candidates;
        const maxCandidates = rawMaxCandidates === undefined ? 48 : Number(rawMaxCandidates);
        if (!Number.isInteger(maxCandidates) || maxCandidates < 1 || maxCandidates > 200) {
            return res.status(400).json({ error: 'FOLATE_MAX_CANDIDATES_INVALID' });
        }

        const result = await resolveWithFolate({ query, html, topK, maxCandidates });
        res.json(result);
    } catch (error) {
        const status = error?.code === 'FOLATE_UNAVAILABLE' ? 503 : 500;
        res.status(status).json({ error: error?.message || 'FOLATE_RESOLVE_FAILED' });
    }
});

module.exports = router;
