const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');
const JSZip = require('jszip');
const { requireAuthForSettings, csrfProtection, dataRateLimiter } = require('../middleware');
const { validateUrl } = require('../../../url-utils');
const {
    loadApiKey, saveApiKey,
    loadThemeConfig, saveThemeConfig,
    loadCaptchaSettings, saveCaptchaSettings,
    loadSystemSettings, saveSystemSettings,
    loadUsers, loadTasks, loadExecutions, saveTasks, saveExecutions, saveCredentials
} = require('../storage');
const { DATA_DIR, STORAGE_STATE_PATH } = require('../constants');
const { getStatus: getExecutionQueueStatus } = require('../execution-queue');
const { getCaptchaResourceStatus } = require('../captcha-resources');
const { runRetentionCleanup, getRetentionStatus } = require('../retention');
const cookie = require('cookie');
const { getUserAgentConfig, setUserAgentSelection } = require('../../../user-agent-settings');
const { listProxies, addProxy, addProxies, updateProxy, deleteProxy, deleteProxies, setDefaultProxy, setIncludeDefaultInRotation, setRotationMode } = require('../../../proxy-rotation');
const { DB_FIELDS, getEnvironmentDatabaseConfig, loadDatabaseConfig, maskedDatabaseConfig, saveDatabaseConfig } = require('../database-config');

const router = express.Router();

router.post('/reset', csrfProtection, dataRateLimiter, requireAuthForSettings, async (req, res) => {
    const currentPassword = req.body?.currentPassword;
    if (typeof currentPassword !== 'string') return res.status(400).json({ error: 'CURRENT_PASSWORD_REQUIRED' });
    const users = await loadUsers();
    const user = users.find((candidate) => String(candidate.id) === String(req.session?.user?.id));
    if (!user || !await bcrypt.compare(currentPassword, user.password)) return res.status(401).json({ error: 'INVALID_CURRENT_PASSWORD' });
    try {
        const captureDirs = [path.join(__dirname, '../../../public/captures'), path.join(__dirname, '../../../src/public/captures'), path.join(DATA_DIR, 'recordings')];
        await Promise.all([
            saveTasks([]), saveExecutions([]), saveCredentials([]), saveApiKey(null),
            saveThemeConfig('auto'), saveCaptchaSettings({}), saveSystemSettings({ retentionDays: 7 }),
            ...captureDirs.map((dir) => fs.promises.rm(dir, { recursive: true, force: true })),
            fs.promises.rm(path.join(DATA_DIR, 'browser-profile'), { recursive: true, force: true }),
            fs.promises.rm(path.join(DATA_DIR, 'browser-profile-scrape'), { recursive: true, force: true }),
            fs.promises.rm(path.join(DATA_DIR, 'browser-profile-headful'), { recursive: true, force: true }),
            fs.promises.rm(path.join(DATA_DIR, 'captcha-model'), { recursive: true, force: true }),
            fs.promises.rm(STORAGE_STATE_PATH, { recursive: true, force: true })
        ]);
        const proxyConfig = listProxies();
        deleteProxies(proxyConfig.proxies.filter((proxy) => proxy.id !== 'host').map((proxy) => proxy.id));
        await require('../cabinets').resetCabinets();
        res.clearCookie('figranium_theme');
        res.json({ success: true });
    } catch (error) {
        console.error('[SETTINGS] Workspace reset failed:', error);
        res.status(500).json({ error: 'WORKSPACE_RESET_FAILED' });
    }
});

router.get('/system', requireAuthForSettings, async (_req, res) => {
    try {
        res.json({
            ...(await loadSystemSettings()),
            protection: getExecutionQueueStatus(),
            captcha: getCaptchaResourceStatus(),
            cleanup: getRetentionStatus()
        });
    } catch (error) { res.status(500).json({ error: 'SYSTEM_SETTINGS_LOAD_FAILED' }); }
});

router.post('/system', csrfProtection, dataRateLimiter, requireAuthForSettings, async (req, res) => {
    try {
        const previous = await loadSystemSettings();
        const saved = await saveSystemSettings({ retentionDays: req.body?.retentionDays });
        const reducing = saved.retentionDays !== null && (previous.retentionDays === null || saved.retentionDays < previous.retentionDays);
        const cleanup = reducing ? await runRetentionCleanup() : getRetentionStatus();
        res.json({ ...saved, cleanup });
    } catch (error) {
        res.status(400).json({ error: 'INVALID_SYSTEM_SETTINGS', message: error.message });
    }
});

router.post('/export', csrfProtection, dataRateLimiter, requireAuthForSettings, async (req, res) => {
    const allowed = new Set(['tasks', 'executions', 'captures', 'apiKeys', 'cookies']);
    const include = [...new Set(Array.isArray(req.body?.include) ? req.body.include.filter((item) => allowed.has(item)) : [])];
    if (!include.length) return res.status(400).json({ error: 'EXPORT_SELECTION_REQUIRED' });

    try {
        const zip = new JSZip();
        const addJson = (name, value) => zip.file(name, JSON.stringify(value, null, 2));

        if (include.includes('tasks')) addJson('tasks.json', await loadTasks());
        if (include.includes('executions')) addJson('executions.json', await loadExecutions());
        if (include.includes('apiKeys')) addJson('api-keys.json', { apiKey: await loadApiKey() });

        if (include.includes('cookies')) {
            let state = { cookies: [], origins: [] };
            try {
                if (fs.existsSync(STORAGE_STATE_PATH)) state = JSON.parse(await fs.promises.readFile(STORAGE_STATE_PATH, 'utf8'));
            } catch { }
            addJson('cookies.json', { cookies: Array.isArray(state?.cookies) ? state.cookies : [] });
        }

        if (include.includes('captures')) {
            const captureDirs = [
                path.join(__dirname, '../../../public/captures'),
                path.join(__dirname, '../../../src/public/captures'),
                path.join(DATA_DIR, 'recordings')
            ];
            const captures = zip.folder('captures');
            const seen = new Set();
            for (const dir of captureDirs) {
                let entries = [];
                try { entries = await fs.promises.readdir(dir, { withFileTypes: true }); } catch { continue; }
                for (const entry of entries) {
                    if (!entry.isFile()) continue;
                    let name = entry.name;
                    if (seen.has(name)) name = `${path.basename(dir)}-${name}`;
                    seen.add(name);
                    captures.file(name, await fs.promises.readFile(path.join(dir, entry.name)));
                }
            }
        }

        addJson('manifest.json', { exportedAt: new Date().toISOString(), included: include });
        const archive = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 6 } });
        const date = new Date().toISOString().slice(0, 10);
        res.setHeader('Content-Type', 'application/zip');
        res.setHeader('Content-Disposition', `attachment; filename="figranium-export-${date}.zip"`);
        res.setHeader('Cache-Control', 'no-store');
        res.send(archive);
    } catch (error) {
        console.error('[SETTINGS] Data export failed:', error);
        res.status(500).json({ error: 'DATA_EXPORT_FAILED' });
    }
});

router.post('/import', csrfProtection, dataRateLimiter, requireAuthForSettings, express.raw({ type: 'application/zip', limit: '100mb' }), async (req, res) => {
    try {
        if (!Buffer.isBuffer(req.body) || !req.body.length) return res.status(400).json({ error: 'IMPORT_FILE_REQUIRED' });
        const zip = await JSZip.loadAsync(req.body);
        const manifestFile = zip.file('manifest.json');
        if (!manifestFile) return res.status(400).json({ error: 'INVALID_FIGRANIUM_EXPORT' });
        const manifest = JSON.parse(await manifestFile.async('string'));
        const available = Array.isArray(manifest?.included) ? manifest.included.filter((item) => ['tasks', 'executions', 'captures', 'apiKeys', 'cookies'].includes(item)) : [];
        const requested = String(req.query.include || '').split(',').filter(Boolean);
        const include = requested.length ? requested.filter((item) => available.includes(item)) : available;
        if (!include.length) return res.status(400).json({ error: 'IMPORT_SELECTION_REQUIRED', available });

        const readJson = async (name) => {
            const file = zip.file(name);
            if (!file) throw new Error(`Missing ${name}`);
            return JSON.parse(await file.async('string'));
        };

        if (include.includes('tasks')) {
            const tasks = await readJson('tasks.json');
            if (!Array.isArray(tasks)) throw new Error('Invalid tasks.json');
            await saveTasks(tasks);
        }
        if (include.includes('executions')) {
            const executions = await readJson('executions.json');
            if (!Array.isArray(executions)) throw new Error('Invalid executions.json');
            await saveExecutions(executions);
        }
        if (include.includes('apiKeys')) {
            const keys = await readJson('api-keys.json');
            await saveApiKey(typeof keys?.apiKey === 'string' ? keys.apiKey : null);
        }
        if (include.includes('cookies')) {
            const imported = await readJson('cookies.json');
            const current = await fs.promises.readFile(STORAGE_STATE_PATH, 'utf8').then(JSON.parse).catch(() => ({ origins: [] }));
            await fs.promises.writeFile(STORAGE_STATE_PATH, JSON.stringify({
                cookies: Array.isArray(imported?.cookies) ? imported.cookies : [],
                origins: Array.isArray(current?.origins) ? current.origins : []
            }, null, 2));
        }
        if (include.includes('captures')) {
            const captureDir = path.join(__dirname, '../../../public/captures');
            await fs.promises.mkdir(captureDir, { recursive: true });
            const files = Object.values(zip.files).filter((entry) => !entry.dir && entry.name.startsWith('captures/'));
            for (const entry of files) {
                const name = path.basename(entry.name);
                if (!name) continue;
                await fs.promises.writeFile(path.join(captureDir, name), await entry.async('nodebuffer'));
            }
        }

        res.json({ success: true, imported: include, available });
    } catch (error) {
        console.error('[SETTINGS] Data import failed:', error);
        res.status(400).json({ error: 'DATA_IMPORT_FAILED', message: error.message });
    }
});

router.post('/import/inspect', csrfProtection, dataRateLimiter, requireAuthForSettings, express.raw({ type: 'application/zip', limit: '100mb' }), async (req, res) => {
    try {
        if (!Buffer.isBuffer(req.body) || !req.body.length) return res.status(400).json({ error: 'IMPORT_FILE_REQUIRED' });
        const zip = await JSZip.loadAsync(req.body);
        const manifestFile = zip.file('manifest.json');
        if (!manifestFile) return res.status(400).json({ error: 'INVALID_FIGRANIUM_EXPORT' });
        const manifest = JSON.parse(await manifestFile.async('string'));
        const allowed = ['tasks', 'executions', 'captures', 'apiKeys', 'cookies'];
        res.json({ available: Array.isArray(manifest?.included) ? manifest.included.filter((item) => allowed.includes(item)) : [], exportedAt: manifest?.exportedAt || null });
    } catch {
        res.status(400).json({ error: 'INVALID_FIGRANIUM_EXPORT' });
    }
});

router.get('/database', requireAuthForSettings, async (_req, res) => {
    const environmentConfig = getEnvironmentDatabaseConfig();
    const savedConfig = environmentConfig ? null : await loadDatabaseConfig();
    res.json({
        ...maskedDatabaseConfig(environmentConfig || savedConfig),
        source: environmentConfig ? 'environment' : savedConfig ? 'settings' : 'none',
        restartRequired: true
    });
});

router.post('/database', csrfProtection, dataRateLimiter, requireAuthForSettings, async (req, res) => {
    try {
        const existing = await loadDatabaseConfig();
        const next = {};
        for (const field of DB_FIELDS) {
            const incoming = req.body?.[field];
            next[field] = typeof incoming === 'string' && incoming.trim() ? incoming : existing?.[field] || '';
        }
        await saveDatabaseConfig(next);
        res.json({
            ...maskedDatabaseConfig(await loadDatabaseConfig()),
            source: getEnvironmentDatabaseConfig() ? 'environment' : 'settings',
            restartRequired: true
        });
    } catch (error) {
        res.status(400).json({ error: 'INVALID_DATABASE_CONFIG', message: error.message });
    }
});

function createNewApiKey() {
    return crypto.randomBytes(32).toString('hex');
}

async function validateProxyServer(server) {
    if (!server || typeof server !== 'string') return;
    let urlToCheck = server.trim();
    if (!urlToCheck.includes('://')) urlToCheck = 'http://' + urlToCheck;
    await validateUrl(urlToCheck);
}

// API Key
router.get('/api-key', requireAuthForSettings, async (req, res) => {
    try {
        const currentKey = await loadApiKey();
        res.json({ apiKey: currentKey || null });
    } catch (e) {
        console.error('[API_KEY] Load failed:', e);
        res.status(500).json({ error: 'API_KEY_LOAD_FAILED' });
    }
});

router.post('/api-key', csrfProtection, dataRateLimiter, requireAuthForSettings, async (req, res) => {
    try {
        const bodyKey = req.body && typeof req.body.apiKey === 'string' ? req.body.apiKey.trim() : '';
        if (bodyKey.length > 512) return res.status(400).json({ error: 'API_KEY_TOO_LONG' });
        const newKey = bodyKey || createNewApiKey();
        await saveApiKey(newKey);
        res.json({ apiKey: newKey });
    } catch (e) {
        console.error('[API_KEY] Save failed:', e);
        res.status(500).json({ error: 'API_KEY_SAVE_FAILED' });
    }
});

// User Agent
// User Agent
router.get('/user-agent', requireAuthForSettings, async (_req, res) => {
    try {
        res.json(await getUserAgentConfig());
    } catch (e) {
        console.error('[USER_AGENT] Load failed:', e);
        res.status(500).json({ error: 'USER_AGENT_LOAD_FAILED' });
    }
});

router.post('/user-agent', csrfProtection, requireAuthForSettings, async (req, res) => {
    if (typeof req.csrfToken === 'function') req.csrfToken();
    try {
        const selection = req.body && typeof req.body.selection === 'string' ? req.body.selection : null;
        await setUserAgentSelection(selection);
        res.json(await getUserAgentConfig());
    } catch (e) {
        console.error('[USER_AGENT] Save failed:', e);
        res.status(500).json({ error: 'USER_AGENT_SAVE_FAILED' });
    }
});

// Proxies
router.get('/proxies', requireAuthForSettings, (_req, res) => {
    try {
        res.json(listProxies());
    } catch (e) {
        console.error('[PROXIES] Load failed:', e);
        res.status(500).json({ error: 'PROXY_LOAD_FAILED' });
    }
});

router.post('/proxies', csrfProtection, dataRateLimiter, requireAuthForSettings, async (req, res) => {
    const { server, username, password, label, isRotatingPool, estimatedPoolSize } = req.body || {};
    if (!server || typeof server !== 'string') {
        return res.status(400).json({ error: 'MISSING_SERVER' });
    }

    // SSRF Validation
    try {
        await validateProxyServer(server);
    } catch (err) {
        return res.status(400).json({ error: 'INVALID_URL', message: err.message });
    }

    try {
        const result = addProxy({ server, username, password, label, isRotatingPool, estimatedPoolSize });
        if (!result) return res.status(400).json({ error: 'INVALID_PROXY' });
        res.json(listProxies());
    } catch (e) {
        console.error('[PROXIES] Add failed:', e);
        res.status(500).json({ error: 'PROXY_SAVE_FAILED' });
    }
});

router.post('/proxies/import', csrfProtection, dataRateLimiter, requireAuthForSettings, async (req, res) => {
    const entries = req.body && Array.isArray(req.body.proxies) ? req.body.proxies : [];
    if (entries.length === 0) {
        return res.status(400).json({ error: 'MISSING_PROXIES' });
    }

    // SSRF Validation for each entry
    for (const entry of entries) {
        const serverRaw = entry.server || entry.url || entry.proxy;
        try {
            await validateProxyServer(serverRaw);
        } catch (err) {
            return res.status(400).json({ error: 'INVALID_URL', message: `Invalid proxy server: ${serverRaw}. ${err.message}` });
        }
    }

    try {
        const result = addProxies(entries);
        if (!result) return res.status(400).json({ error: 'INVALID_PROXY' });
        res.json(listProxies());
    } catch (e) {
        console.error('[PROXIES] Import failed:', e);
        res.status(500).json({ error: 'PROXY_IMPORT_FAILED' });
    }
});

router.put('/proxies/:id', csrfProtection, dataRateLimiter, requireAuthForSettings, async (req, res) => {
    const id = String(req.params.id || '').trim();
    if (!id || id === 'host') return res.status(400).json({ error: 'INVALID_ID' });
    const { server, username, password, label, isRotatingPool, estimatedPoolSize } = req.body || {};
    if (!server || typeof server !== 'string') {
        return res.status(400).json({ error: 'MISSING_SERVER' });
    }

    // SSRF Validation
    try {
        await validateProxyServer(server);
    } catch (err) {
        return res.status(400).json({ error: 'INVALID_URL', message: err.message });
    }

    try {
        const result = updateProxy(id, { server, username, password, label, isRotatingPool, estimatedPoolSize });
        if (!result) return res.status(404).json({ error: 'PROXY_NOT_FOUND' });
        res.json(listProxies());
    } catch (e) {
        console.error('[PROXIES] Update failed:', e);
        res.status(500).json({ error: 'PROXY_UPDATE_FAILED' });
    }
});

router.delete('/proxies/:id', csrfProtection, dataRateLimiter, requireAuthForSettings, (req, res) => {
    const id = String(req.params.id || '').trim();
    if (!id) return res.status(400).json({ error: 'MISSING_ID' });
    try {
        const result = deleteProxy(id);
        if (!result) return res.status(404).json({ error: 'PROXY_NOT_FOUND' });
        res.json(listProxies());
    } catch (e) {
        console.error('[PROXIES] Delete failed:', e);
        res.status(500).json({ error: 'PROXY_DELETE_FAILED' });
    }
});

router.delete('/proxies', csrfProtection, dataRateLimiter, requireAuthForSettings, (req, res) => {
    const ids = req.body && Array.isArray(req.body.ids) ? req.body.ids : [];
    if (ids.length === 0) {
        return res.status(400).json({ error: 'MISSING_IDS' });
    }
    try {
        const result = deleteProxies(ids);
        if (!result) return res.status(400).json({ error: 'PROXIES_NOT_DELETED' });
        res.json(listProxies());
    } catch (e) {
        console.error('[PROXIES] Bulk delete failed:', e);
        res.status(500).json({ error: 'PROXIES_BULK_DELETE_FAILED' });
    }
});

router.post('/proxies/default', csrfProtection, dataRateLimiter, requireAuthForSettings, (req, res) => {
    const id = req.body && req.body.id ? String(req.body.id) : '';
    try {
        const result = setDefaultProxy(id || null);
        if (!result) return res.status(404).json({ error: 'PROXY_NOT_FOUND' });
        res.json(listProxies());
    } catch (e) {
        console.error('[PROXIES] Default failed:', e);
        res.status(500).json({ error: 'PROXY_DEFAULT_FAILED' });
    }
});

router.post('/proxies/rotation', csrfProtection, dataRateLimiter, requireAuthForSettings, (req, res) => {
    const body = req.body || {};
    const hasIncludeDefault = Object.prototype.hasOwnProperty.call(body, 'includeDefaultInRotation');
    const includeDefaultInRotation = !!body.includeDefaultInRotation;
    const rotationMode = typeof body.rotationMode === 'string' ? body.rotationMode : null;
    try {
        if (hasIncludeDefault) setIncludeDefaultInRotation(includeDefaultInRotation);
        if (rotationMode) setRotationMode(rotationMode);
        res.json(listProxies());
    } catch (e) {
        console.error('[PROXIES] Rotation toggle failed:', e);
        res.status(500).json({ error: 'PROXY_ROTATION_FAILED' });
    }
});

// Theme Persistence Endpoints
router.get('/theme', dataRateLimiter, requireAuthForSettings, async (req, res) => {
    try {
        let theme = await loadThemeConfig();
        if (!theme) {
            // Check for existing theme cookies
            const cookies = cookie.parse(req.headers.cookie || '');
            const cookieTheme = cookies['figranium_theme'] || cookies['theme'];
            const validThemes = ['auto', 'dark', 'light', 'solarized-light', 'solarized-dark'];
            if (cookieTheme && validThemes.includes(cookieTheme.trim())) {
                theme = cookieTheme.trim();
                await saveThemeConfig(theme);
            } else {
                theme = 'auto';
            }
        }
        res.json({ theme });
    } catch (e) {
        console.error('[THEME] Load failed:', e);
        res.status(500).json({ error: 'THEME_LOAD_FAILED' });
    }
});

router.post('/theme', csrfProtection, dataRateLimiter, requireAuthForSettings, async (req, res) => {
    try {
        const bodyTheme = req.body && typeof req.body.theme === 'string' ? req.body.theme.trim() : '';
        const validThemes = ['auto', 'dark', 'light', 'solarized-light', 'solarized-dark'];
        const selectedTheme = validThemes.includes(bodyTheme) ? bodyTheme : 'auto';

        const savedTheme = await saveThemeConfig(selectedTheme);

        // Set persistent cookie for fast initial page load (1 year TTL)
        res.setHeader('Set-Cookie', cookie.serialize('figranium_theme', savedTheme, {
            path: '/',
            maxAge: 31536000,
            sameSite: 'lax',
            httpOnly: false
        }));

        res.json({ theme: savedTheme });
    } catch (e) {
        console.error('[THEME] Save failed:', e);
        res.status(500).json({ error: 'THEME_SAVE_FAILED' });
    }
});

// Captcha Solver Settings Endpoints
// Optional YesCaptcha/AntiCaptcha-compatible endpoint. Environment variables take
// precedence over these persisted values.
router.get('/captcha', requireAuthForSettings, async (req, res) => {
    try {
        const settings = await loadCaptchaSettings();
        res.json({ baseUrl: settings?.baseUrl || '', clientKey: settings?.clientKey ? '••••••••' : '' });
    } catch (e) {
        console.error('[SETTINGS] Failed to load captcha settings:', e);
        res.status(500).json({ error: 'CAPTCHA_SETTINGS_LOAD_FAILED' });
    }
});

router.post('/captcha', csrfProtection, dataRateLimiter, requireAuthForSettings, async (req, res) => {
    try {
        const bodyBaseUrl = req.body && typeof req.body.baseUrl === 'string' ? req.body.baseUrl.trim() : '';
        const bodyClientKey = req.body && typeof req.body.clientKey === 'string' ? req.body.clientKey.trim() : '';
        const validatedBaseUrl = bodyBaseUrl ? await validateUrl(bodyBaseUrl) : '';
        const saved = await saveCaptchaSettings({ baseUrl: validatedBaseUrl, clientKey: bodyClientKey });
        res.json({ baseUrl: saved.baseUrl, clientKey: saved.clientKey ? '••••••••' : '' });
    } catch (e) {
        console.error('[SETTINGS] Failed to save captcha settings:', e);
        const invalidUrl = /Invalid URL|Only HTTP|private network/i.test(e.message || '');
        res.status(invalidUrl ? 400 : 500).json({ error: invalidUrl ? 'INVALID_BASE_URL' : 'CAPTCHA_SETTINGS_SAVE_FAILED' });
    }
});

module.exports = router;
