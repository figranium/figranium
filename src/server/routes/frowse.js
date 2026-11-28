const express = require('express');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { requireAuthOrApiKey, requireScopedPermission, dataRateLimiter } = require('../middleware');
const { validateUrl } = require('../../../url-utils');
const {
    FROWSE_ACTIONS,
    isValidSessionName,
    getFrowseStatus,
    runFrowseCommand,
    listFrowseSessions,
    closeAllFrowseSessions
} = require('../../agent/figranite/frowse-client');

const router = express.Router();

const ARTIFACT_DIR = path.join(os.tmpdir(), 'figranium-frowse');
const UPLOAD_DIR = process.env.FROWSE_UPLOAD_DIR || path.join(ARTIFACT_DIR, 'uploads');
const MAX_INLINE_ARTIFACT_BYTES = 10 * 1024 * 1024;

function isPlainObject(v) {
    return v && typeof v === 'object' && !Array.isArray(v);
}

function sendError(res, error) {
    const status = error?.status || (error?.code === 'FROWSE_UNAVAILABLE' ? 503 : 500);
    res.status(status).json({ error: error?.code || 'FROWSE_FAILED', message: error?.message });
}

// Only allow daemon-start options that cannot reach arbitrary hosts or binaries.
function sanitizeOptions(raw) {
    const out = {};
    if (!isPlainObject(raw)) return out;
    const t = raw.timeoutMs ?? raw.timeout;
    if (t !== undefined) {
        const n = Number(t);
        if (!Number.isInteger(n) || n < 1000 || n > 120_000) throw Object.assign(new Error('timeoutMs must be 1000-120000'), { code: 'FROWSE_OPTIONS_INVALID', status: 400 });
        out.timeoutMs = n;
    }
    if (raw.viewport !== undefined) {
        if (typeof raw.viewport !== 'string' || !/^\d{2,5}x\d{2,5}$/i.test(raw.viewport)) throw Object.assign(new Error('viewport must look like 1280x800'), { code: 'FROWSE_OPTIONS_INVALID', status: 400 });
        out.viewport = raw.viewport;
    }
    if (raw.userAgent !== undefined) {
        if (typeof raw.userAgent !== 'string' || raw.userAgent.length > 512) throw Object.assign(new Error('userAgent invalid'), { code: 'FROWSE_OPTIONS_INVALID', status: 400 });
        out.userAgent = raw.userAgent;
    }
    return out;
}

function badArgs(message) {
    return Object.assign(new Error(message), { code: 'FROWSE_ARGS_INVALID', status: 400 });
}

// Apply Figranium safety policy to arguments before they reach the daemon.
async function prepareArgs(action, args) {
    const prepared = { ...args };
    if (action === 'open' || action === 'read' || (action === 'tab' && prepared.url)) {
        if (prepared.url) {
            let url = String(prepared.url);
            if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(url)) url = `https://${url}`;
            if (/^about:blank$/i.test(url)) { prepared.url = url; }
            else { prepared.url = await validateUrl(url); }
        }
    }
    if (action === 'screenshot' || action === 'pdf') {
        // Never let remote callers choose server-side write paths.
        fs.mkdirSync(ARTIFACT_DIR, { recursive: true, mode: 0o700 });
        prepared.path = path.join(ARTIFACT_DIR, `${randomUUID()}.${action === 'pdf' ? 'pdf' : 'png'}`);
    }
    if (action === 'upload') {
        const files = Array.isArray(prepared.files) ? prepared.files : [prepared.files];
        if (!files.length || files.some(f => typeof f !== 'string' || !f)) throw badArgs('files must be a list of file names inside the Frowse upload directory');
        fs.mkdirSync(UPLOAD_DIR, { recursive: true, mode: 0o700 });
        prepared.files = files.map((f) => {
            const resolved = path.resolve(UPLOAD_DIR, f);
            if (resolved !== UPLOAD_DIR && !resolved.startsWith(UPLOAD_DIR + path.sep)) throw badArgs('upload files must reside inside the Frowse upload directory');
            return resolved;
        });
    }
    if (action === 'cookies' && prepared.op === 'set' && (!prepared.name || prepared.value === undefined)) {
        throw badArgs('cookies set requires name and value');
    }
    return prepared;
}

// Convert server-side artifacts into inline base64 so remote agents (MCP) can read them.
function inlineArtifact(action, result) {
    if ((action !== 'screenshot' && action !== 'pdf') || !result?.path) return result;
    const file = result.path;
    try {
        const stat = fs.statSync(file);
        if (stat.size > MAX_INLINE_ARTIFACT_BYTES) return { error: 'FROWSE_ARTIFACT_TOO_LARGE', bytes: stat.size };
        const data = fs.readFileSync(file).toString('base64');
        return { mimeType: action === 'pdf' ? 'application/pdf' : 'image/png', bytes: stat.size, data };
    } finally {
        fs.rm(file, { force: true }, () => {});
    }
}

async function handleCommand(req, res, session, action, args, rawOptions) {
    try {
        if (!isValidSessionName(session)) return res.status(400).json({ error: 'FROWSE_SESSION_INVALID' });
        if (!FROWSE_ACTIONS.includes(action)) return res.status(400).json({ error: 'FROWSE_ACTION_INVALID', actions: FROWSE_ACTIONS });
        if (args !== undefined && !isPlainObject(args)) return res.status(400).json({ error: 'FROWSE_ARGS_INVALID' });
        const options = sanitizeOptions(rawOptions);
        const prepared = await prepareArgs(action, args || {});
        const result = await runFrowseCommand(session, action, prepared, options);
        res.json({ session, action, result: inlineArtifact(action, result) });
    } catch (error) {
        if (/Invalid URL|private|not allowed|Only http/i.test(error?.message || '') && !error.code) {
            return res.status(400).json({ error: 'FROWSE_URL_NOT_ALLOWED', message: error.message });
        }
        sendError(res, error);
    }
}

router.get('/status', requireAuthOrApiKey, requireScopedPermission('tasks:read'), dataRateLimiter, (_req, res) => {
    try {
        res.json(getFrowseStatus());
    } catch (error) {
        res.status(500).json({ error: error.message || 'FROWSE_STATUS_FAILED' });
    }
});

router.get('/sessions', requireAuthOrApiKey, requireScopedPermission('tasks:read'), dataRateLimiter, async (_req, res) => {
    try {
        res.json({ sessions: await listFrowseSessions() });
    } catch (error) {
        sendError(res, error);
    }
});

// Generic form: POST /api/frowse/sessions/:session/commands { action, args, options }
router.post('/sessions/:session/commands', requireAuthOrApiKey, requireScopedPermission('tasks:run'), dataRateLimiter, (req, res) => {
    const action = typeof req.body?.action === 'string' ? req.body.action : '';
    return handleCommand(req, res, req.params.session, action, req.body?.args, req.body?.options);
});

// Convenience form: POST /api/frowse/sessions/:session/:action  { ...args, options? }
router.post('/sessions/:session/:action', requireAuthOrApiKey, requireScopedPermission('tasks:run'), dataRateLimiter, (req, res) => {
    const { options, ...args } = isPlainObject(req.body) ? req.body : {};
    return handleCommand(req, res, req.params.session, req.params.action, args, options);
});

router.delete('/sessions/:session', requireAuthOrApiKey, requireScopedPermission('tasks:run'), dataRateLimiter, async (req, res) => {
    try {
        if (!isValidSessionName(req.params.session)) return res.status(400).json({ error: 'FROWSE_SESSION_INVALID' });
        res.json({ session: req.params.session, ...(await runFrowseCommand(req.params.session, 'close')) });
    } catch (error) {
        sendError(res, error);
    }
});

router.delete('/sessions', requireAuthOrApiKey, requireScopedPermission('tasks:run'), dataRateLimiter, async (_req, res) => {
    try {
        res.json({ closed: await closeAllFrowseSessions() });
    } catch (error) {
        sendError(res, error);
    }
});

module.exports = router;
