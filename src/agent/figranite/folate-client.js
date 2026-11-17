const fs = require('node:fs');
const os = require('node:os');
const { spawn } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const path = require('node:path');
const { parseCoords } = require('../../../common-utils');

const WORKER_SCRIPT = path.resolve(__dirname, '../../../scripts/folate_worker.py');
const VENV_DIR = path.join(os.homedir(), '.figranium', 'folate-venv');
const IDLE_TIMEOUT_MS = 5 * 60 * 1000;
const DEFAULT_REQUEST_TIMEOUT_MS = 60_000;

function resolvePythonBin() {
    if (process.env.FOLATE_PYTHON) return process.env.FOLATE_PYTHON;
    const venvPython = process.platform === 'win32'
        ? path.join(VENV_DIR, 'Scripts', 'python.exe')
        : path.join(VENV_DIR, 'bin', 'python3');
    if (fs.existsSync(venvPython)) return venvPython;
    return 'python3';
}

const HTML_TAGS = new Set([
    'a', 'abbr', 'address', 'area', 'article', 'aside', 'audio', 'b', 'base', 'bdi', 'bdo',
    'blockquote', 'body', 'br', 'button', 'canvas', 'caption', 'cite', 'code', 'col', 'colgroup',
    'data', 'datalist', 'dd', 'del', 'details', 'dfn', 'dialog', 'div', 'dl', 'dt', 'em', 'embed',
    'fieldset', 'figcaption', 'figure', 'footer', 'form', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'head', 'header', 'hgroup', 'hr', 'html', 'i', 'iframe', 'img', 'input', 'ins', 'kbd', 'label',
    'legend', 'li', 'link', 'main', 'map', 'mark', 'menu', 'meta', 'meter', 'nav', 'noscript',
    'object', 'ol', 'optgroup', 'option', 'output', 'p', 'picture', 'pre', 'progress', 'q', 'rp',
    'rt', 'ruby', 's', 'samp', 'script', 'search', 'section', 'select', 'slot', 'small', 'source',
    'span', 'strong', 'style', 'sub', 'summary', 'sup', 'svg', 'table', 'tbody', 'td', 'template',
    'textarea', 'tfoot', 'th', 'thead', 'time', 'title', 'tr', 'track', 'u', 'ul', 'var', 'video',
    'wbr'
]);

const PLAYWRIGHT_ENGINE_PREFIX = /^(?:css|xpath|text|id|data-testid|data-test-id|data-test|role|internal|nth)=/i;
const EXPLICIT_FOLATE_PREFIX = /^(?:folate|ai):/i;
const CSS_SYNTAX_CHARS = /[#.[\]>+~:*=,]/;

function stripFolatePrefix(raw) {
    return String(raw || '').replace(EXPLICIT_FOLATE_PREFIX, '').trim();
}

function isNaturalLanguageSelector(raw) {
    if (typeof raw !== 'string') return false;
    const trimmed = raw.trim();
    if (!trimmed) return false;

    if (EXPLICIT_FOLATE_PREFIX.test(trimmed)) return true;
    if (parseCoords(trimmed)) return false;

    if (
        trimmed.startsWith('/') ||
        trimmed.startsWith('./') ||
        trimmed.startsWith('(/') ||
        trimmed.startsWith('(//') ||
        PLAYWRIGHT_ENGINE_PREFIX.test(trimmed)
    ) {
        return false;
    }

    if (CSS_SYNTAX_CHARS.test(trimmed)) {
        return false;
    }

    const tokens = trimmed.split(/\s+/).filter(Boolean);
    if (tokens.length === 0) return false;

    // Pure HTML tag or descendant tag chain like "button" or "form button" -> CSS selector
    if (tokens.every((token) => HTML_TAGS.has(token.toLowerCase()))) {
        return false;
    }

    return true;
}

let workerProc = null;
let workerBuffer = '';
let idleTimer = null;
const pending = new Map();

function resetIdleTimer() {
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
        shutdownFolateWorker();
    }, IDLE_TIMEOUT_MS);
    idleTimer.unref?.();
}

function rejectAllPending(err) {
    for (const [, entry] of pending) {
        clearTimeout(entry.timer);
        entry.reject(err);
    }
    pending.clear();
}

function shutdownFolateWorker() {
    if (idleTimer) {
        clearTimeout(idleTimer);
        idleTimer = null;
    }
    if (workerProc) {
        const proc = workerProc;
        workerProc = null;
        workerBuffer = '';
        try {
            proc.stdin?.end();
            proc.kill();
        } catch {
            // ignore
        }
    }
}

function ensureWorker() {
    if (workerProc && !workerProc.killed && workerProc.exitCode === null) {
        resetIdleTimer();
        return workerProc;
    }

    const pythonBin = resolvePythonBin();
    const proc = spawn(pythonBin, [WORKER_SCRIPT], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, PYTHONUNBUFFERED: '1' }
    });
    proc.unref?.();
    workerProc = proc;
    workerBuffer = '';
    let stderrTail = '';

    proc.stdout.setEncoding('utf8');
    proc.stdout.on('data', (chunk) => {
        workerBuffer += chunk;
        let idx;
        while ((idx = workerBuffer.indexOf('\n')) !== -1) {
            const line = workerBuffer.slice(0, idx).trim();
            workerBuffer = workerBuffer.slice(idx + 1);
            if (!line) continue;
            try {
                const msg = JSON.parse(line);
                const entry = pending.get(msg.id);
                if (!entry) continue;
                pending.delete(msg.id);
                clearTimeout(entry.timer);
                if (msg.ok) entry.resolve(msg);
                else {
                    const err = new Error(msg.error || 'FOLATE_WORKER_ERROR');
                    if (String(msg.error || '').includes('No module named')) {
                        err.code = 'FOLATE_UNAVAILABLE';
                    }
                    entry.reject(err);
                }
            } catch {
                // ignore malformed stdout line
            }
        }
    });

    proc.stderr.setEncoding('utf8');
    proc.stderr.on('data', (chunk) => {
        stderrTail = (stderrTail + chunk).slice(-1024);
    });

    proc.on('error', (err) => {
        if (workerProc === proc) workerProc = null;
        const wrapped = new Error(`FOLATE_UNAVAILABLE: Failed to start ${pythonBin} (${err.message})`);
        wrapped.code = 'FOLATE_UNAVAILABLE';
        rejectAllPending(wrapped);
    });

    proc.on('exit', (code) => {
        if (workerProc === proc) workerProc = null;
        if (pending.size > 0) {
            const detail = stderrTail.trim();
            const isMissing = detail.includes('No module named') || code === 127;
            const err = new Error(
                isMissing
                    ? "FOLATE_UNAVAILABLE: Python 'folate' package is not installed. Run: pip install folate"
                    : `FOLATE_WORKER_EXITED (${code})${detail ? `: ${detail}` : ''}`
            );
            err.code = isMissing ? 'FOLATE_UNAVAILABLE' : 'FOLATE_WORKER_EXITED';
            rejectAllPending(err);
        }
    });

    resetIdleTimer();
    return proc;
}

function callLocalWorker(payload, timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS) {
    return new Promise((resolve, reject) => {
        let proc;
        try {
            proc = ensureWorker();
        } catch (err) {
            reject(err);
            return;
        }
        const id = randomUUID();
        const timer = setTimeout(() => {
            pending.delete(id);
            reject(new Error('FOLATE_TIMEOUT'));
        }, timeoutMs);
        timer.unref?.();

        pending.set(id, { resolve, reject, timer });
        try {
            proc.stdin.write(JSON.stringify({ id, ...payload }) + '\n');
        } catch (err) {
            pending.delete(id);
            clearTimeout(timer);
            reject(err);
        }
    });
}

async function resolveWithFolate({ query, html, topK = 3, maxCandidates = 48, timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS } = {}) {
    const cleanQuery = stripFolatePrefix(query);
    if (!cleanQuery) throw new Error('FOLATE_QUERY_REQUIRED');
    if (typeof html !== 'string' || !html.trim()) throw new Error('FOLATE_HTML_REQUIRED');

    const safeTopK = Number.isInteger(topK) ? Math.min(20, Math.max(1, topK)) : 3;
    const safeMaxCandidates = Number.isInteger(maxCandidates) ? Math.min(200, Math.max(1, maxCandidates)) : 48;

    const result = await callLocalWorker(
        {
            action: 'resolve',
            query: cleanQuery,
            html,
            top_k: safeTopK,
            max_candidates: safeMaxCandidates
        },
        timeoutMs
    );
    return {
        selector: result.selector ?? null,
        score: result.score ?? null,
        logit: result.logit ?? null,
        element: result.element ?? null,
        matches: Array.isArray(result.matches) ? result.matches : []
    };
}

async function getFolateStatus() {
    try {
        const status = await callLocalWorker({ action: 'status' }, 15_000);
        return {
            available: Boolean(status.available),
            mode: 'local',
            providers: status.providers || []
        };
    } catch (error) {
        return {
            available: false,
            mode: 'local',
            error: error.message
        };
    }
}

module.exports = {
    isNaturalLanguageSelector,
    stripFolatePrefix,
    resolveWithFolate,
    getFolateStatus,
    shutdownFolateWorker
};
