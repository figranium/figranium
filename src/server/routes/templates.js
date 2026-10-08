const express = require('express');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { DATA_DIR } = require('../constants');
const { requireAuth, dataRateLimiter } = require('../middleware');

const router = express.Router();
const TEMPLATE_CATALOG_URL = 'https://templates.figranium.dev/api/presets';
const FETCH_TIMEOUT_MS = 12_000;
const CATALOG_TTL_MS = 5 * 60_000;
let catalogCache = null;
let catalogRequest = null;

const isCatalogPreset = (preset) => preset
    && typeof preset === 'object'
    && typeof preset.id === 'string'
    && typeof preset.title === 'string'
    && preset.configuration
    && typeof preset.configuration === 'object'
    && !Array.isArray(preset.configuration);

const fetchOfficial = async (url, options = {}) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
        return await fetch(url, { headers: { Accept: 'application/json', ...options.headers }, ...options, signal: controller.signal });
    } finally {
        clearTimeout(timer);
    }
};

const loadCatalog = async () => {
    if (catalogCache && catalogCache.expiresAt > Date.now()) return catalogCache.items;
    if (!catalogRequest) {
        catalogRequest = (async () => {
            const upstream = await fetchOfficial(TEMPLATE_CATALOG_URL);
            if (!upstream.ok) throw new Error('TEMPLATE_CATALOG_UNAVAILABLE');
            const items = await upstream.json();
            if (!Array.isArray(items) || !items.every(isCatalogPreset)) throw new Error('TEMPLATE_CATALOG_INVALID');
            catalogCache = { items, expiresAt: Date.now() + CATALOG_TTL_MS };
            return items;
        })().finally(() => { catalogRequest = null; });
    }
    try {
        return await catalogRequest;
    } catch (error) {
        if (catalogCache) return catalogCache.items;
        throw error;
    }
};

setImmediate(() => {
    loadCatalog().catch((error) => {
        console.warn('[templates] Catalog prewarm failed:', error?.message || error);
    });
});

const toSummary = ({ configuration, readme, expected_output, ...preset }) => ({
    ...preset,
    action_count: Array.isArray(configuration?.actions)
        ? configuration.actions.length
        : Array.isArray(configuration?.tasks) ? (configuration.tasks[0]?.actions?.length || 0) : 0
});

const sendCatalogError = (res, error) => {
    const code = error?.name === 'AbortError' ? 'TEMPLATE_CATALOG_TIMEOUT' : error?.message === 'TEMPLATE_CATALOG_INVALID' ? 'TEMPLATE_CATALOG_INVALID' : 'TEMPLATE_CATALOG_UNAVAILABLE';
    return res.status(502).json({ error: code });
};

// The upstream host is fixed. Paginated requests send only card metadata to
// the browser; the workflow and README are fetched from the hub when selected.
router.get('/templates', requireAuth, dataRateLimiter, async (req, res) => {
    try {
        const catalog = await loadCatalog();
        if (!Object.keys(req.query).length) {
            // Preserve the original full-list API for existing integrations.
            return res.json(catalog);
        }

        const limit = Number(req.query.limit ?? 12);
        const offset = Number(req.query.offset ?? 0);
        const sort = String(req.query.sort || 'popular');
        const category = String(req.query.category || 'all');
        const search = String(req.query.search || '').trim().toLowerCase();
        if (!Number.isInteger(limit) || limit < 1 || limit > 24 || !Number.isInteger(offset) || offset < 0 || !['popular', 'newest', 'name'].includes(sort) || category.length > 60 || search.length > 100) {
            return res.status(400).json({ error: 'INVALID_TEMPLATE_QUERY' });
        }

        const matches = catalog.filter((preset) => {
            if (category !== 'all' && preset.category !== category) return false;
            if (!search) return true;
            return [preset.title, preset.description, preset.author_name, preset.category, preset.target_url].filter(Boolean).join(' ').toLowerCase().includes(search);
        });
        matches.sort((a, b) => {
            if (sort === 'name') return a.title.localeCompare(b.title);
            if (sort === 'newest') return String(b.created_at || b.updated_at || '').localeCompare(String(a.created_at || a.updated_at || '')) || a.title.localeCompare(b.title);
            return (Number(b.downloads) || 0) - (Number(a.downloads) || 0) || a.title.localeCompare(b.title);
        });
        res.set('Cache-Control', 'private, max-age=60');
        return res.json({ items: matches.slice(offset, offset + limit).map(toSummary), total: matches.length });
    } catch (error) {
        return sendCatalogError(res, error);
    }
});

router.get('/templates/:id', requireAuth, dataRateLimiter, async (req, res) => {
    const id = req.params.id;
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
        return res.status(400).json({ error: 'INVALID_TEMPLATE_ID' });
    }
    try {
        const upstream = await fetchOfficial(`${TEMPLATE_CATALOG_URL}/${id}`);
        if (upstream.status === 404) return res.status(404).json({ error: 'TEMPLATE_NOT_FOUND' });
        if (!upstream.ok) return res.status(502).json({ error: 'TEMPLATE_CATALOG_UNAVAILABLE' });
        const preset = await upstream.json();
        if (!isCatalogPreset(preset) || preset.id !== id) return res.status(502).json({ error: 'TEMPLATE_CATALOG_INVALID' });
        res.set('Cache-Control', 'private, max-age=60');
        return res.json(preset);
    } catch (error) {
        return sendCatalogError(res, error);
    }
});

// The ID lives in the persistent data directory and is unrelated to telemetry.
// Every installation can import freely, but contributes at most one count per template.
const instanceIdPath = path.join(DATA_DIR, 'template-instance-id');
let instanceId;
const getInstanceId = () => {
    if (instanceId) return instanceId;
    try {
        const existing = fs.readFileSync(instanceIdPath, 'utf8').trim();
        if (/^[0-9a-f-]{36}$/i.test(existing)) return (instanceId = existing);
    } catch (_) { /* Generate on first use. */ }
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const created = crypto.randomUUID();
    try {
        fs.writeFileSync(instanceIdPath, created, { flag: 'wx', mode: 0o600 });
        return (instanceId = created);
    } catch (error) {
        if (error.code === 'EEXIST') {
            const existing = fs.readFileSync(instanceIdPath, 'utf8').trim();
            if (/^[0-9a-f-]{36}$/i.test(existing)) return (instanceId = existing);
        }
        throw error;
    }
};

// Called only after a successful local import; failures never undo the import.
router.post('/templates/:id/import', requireAuth, dataRateLimiter, async (req, res) => {
    const id = req.params.id;
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
        return res.status(400).json({ error: 'INVALID_TEMPLATE_ID' });
    }
    try {
        const upstream = await fetchOfficial(`${TEMPLATE_CATALOG_URL}/${id}/import`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ instance_id: getInstanceId() })
        });
        if (!upstream.ok) return res.status(502).json({ error: 'TEMPLATE_IMPORT_TRACKING_UNAVAILABLE' });
        return res.json(await upstream.json());
    } catch (_) {
        return res.status(502).json({ error: 'TEMPLATE_IMPORT_TRACKING_UNAVAILABLE' });
    }
});

module.exports = router;
