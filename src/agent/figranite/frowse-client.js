'use strict';

/**
 * Node client for the Frowse session daemon (https://github.com/figranium/frowse).
 *
 * Frowse keeps one headless Chromium + Folate model alive per named session and
 * accepts newline-delimited JSON commands ({action, args}) over a per-session
 * Unix socket. This module starts daemons on demand and relays commands.
 */

const fs = require('node:fs');
const os = require('node:os');
const net = require('node:net');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');

const VENV_DIR = path.join(os.homedir(), '.figranium', 'folate-venv');
const SESSION_NAME_RE = /^[A-Za-z0-9_-]{1,64}$/;
const DEFAULT_COMMAND_TIMEOUT_MS = 120_000;
const DAEMON_START_TIMEOUT_MS = 15_000;

// Mirrors frowse.session.BrowserSession._cmd_* handlers.
const FROWSE_ACTIONS = Object.freeze([
    'open', 'back', 'forward', 'reload', 'close', 'snapshot', 'query', 'read',
    'click', 'dblclick', 'fill', 'type', 'press', 'keyboard', 'hover', 'focus',
    'select', 'check', 'uncheck', 'scroll', 'scrollintoview', 'drag', 'upload',
    'get', 'is', 'find', 'wait', 'screenshot', 'pdf', 'eval', 'tab', 'frame',
    'cookies', 'storage', 'dialog', 'console', 'errors', 'highlight'
]);

let cachedPython = null;

function pythonHasFrowse(bin) {
    const probe = spawnSync(bin, ['-c', 'import frowse'], { stdio: 'ignore', timeout: 15_000 });
    return !probe.error && probe.status === 0;
}

function resolvePythonBin() {
    if (process.env.FROWSE_PYTHON) return process.env.FROWSE_PYTHON;
    if (cachedPython) return cachedPython;
    const venvPython = process.platform === 'win32'
        ? path.join(VENV_DIR, 'Scripts', 'python.exe')
        : path.join(VENV_DIR, 'bin', 'python3');
    const candidates = [process.env.FOLATE_PYTHON, venvPython, 'python3'].filter(Boolean);
    for (const bin of candidates) {
        if ((bin === 'python3' || fs.existsSync(bin)) && pythonHasFrowse(bin)) {
            cachedPython = bin;
            return bin;
        }
    }
    return 'python3';
}

function makeError(code, message, status) {
    const err = new Error(message || code);
    err.code = code;
    if (status) err.status = status;
    return err;
}

function isValidSessionName(name) {
    return typeof name === 'string' && SESSION_NAME_RE.test(name);
}

function getStateDir() {
    const uid = typeof process.getuid === 'function' ? process.getuid() : 'user';
    const base = process.env.FROWSE_STATE_DIR || path.join(os.tmpdir(), `frowse-${uid}`);
    fs.mkdirSync(base, { recursive: true, mode: 0o700 });
    return base;
}

function getSocketPath(session) {
    return path.join(getStateDir(), `${session}.sock`);
}

function probeSocket(sockPath, timeoutMs = 1000) {
    return new Promise((resolve) => {
        if (!fs.existsSync(sockPath)) return resolve(false);
        const sock = net.createConnection(sockPath);
        const done = (ok) => { sock.destroy(); resolve(ok); };
        sock.setTimeout(timeoutMs, () => done(false));
        sock.once('connect', () => done(true));
        sock.once('error', () => done(false));
    });
}

async function isSessionAlive(session) {
    return probeSocket(getSocketPath(session));
}

/** Report whether the frowse Python package is importable by the configured interpreter. */
function getFrowseStatus() {
    const python = resolvePythonBin();
    const probe = spawnSync(python, ['-c', 'import frowse, sys; print(getattr(frowse, "__version__", "unknown"))'], {
        encoding: 'utf8',
        timeout: 15_000
    });
    if (probe.error || probe.status !== 0) {
        return {
            available: false,
            python,
            error: 'FROWSE_UNAVAILABLE',
            hint: 'Install with `pip install frowse` into the interpreter used by Figranium (set FROWSE_PYTHON to override).'
        };
    }
    return { available: true, python, version: (probe.stdout || '').trim() || 'unknown', actions: FROWSE_ACTIONS };
}

async function startSession(session, options = {}) {
    if (await isSessionAlive(session)) return;
    const sockPath = getSocketPath(session);
    try { fs.unlinkSync(sockPath); } catch { /* not present */ }

    const args = ['-m', 'frowse.daemon', '--session', session];
    if (Number.isInteger(options.timeoutMs)) args.push('--timeout', String(options.timeoutMs));
    if (typeof options.viewport === 'string' && /^\d{2,5}x\d{2,5}$/i.test(options.viewport)) {
        args.push('--viewport', options.viewport);
    }
    if (typeof options.userAgent === 'string' && options.userAgent) args.push('--user-agent', options.userAgent);
    if (process.env.FROWSE_EXECUTABLE_PATH) args.push('--executable-path', process.env.FROWSE_EXECUTABLE_PATH);
    if (process.env.FOLATE_MODEL_DIR) args.push('--model-dir', process.env.FOLATE_MODEL_DIR);

    const child = spawn(resolvePythonBin(), args, {
        detached: true,
        stdio: 'ignore',
        env: { ...process.env, FROWSE_STATE_DIR: getStateDir() }
    });
    let spawnError = null;
    child.once('error', (err) => { spawnError = err; });
    child.unref();

    const deadline = Date.now() + DAEMON_START_TIMEOUT_MS;
    while (Date.now() < deadline) {
        if (spawnError) break;
        if (await isSessionAlive(session)) return;
        await new Promise((r) => setTimeout(r, 75));
    }
    throw makeError('FROWSE_UNAVAILABLE', spawnError ? spawnError.message : `Timed out starting Frowse session "${session}"`, 503);
}

function sendToDaemon(session, action, args, timeoutMs) {
    return new Promise((resolve, reject) => {
        const sock = net.createConnection(getSocketPath(session));
        let buf = '';
        let settled = false;
        const finish = (fn, value) => {
            if (settled) return;
            settled = true;
            sock.destroy();
            fn(value);
        };
        sock.setTimeout(timeoutMs, () => finish(reject, makeError('FROWSE_TIMEOUT', `Frowse command "${action}" timed out`, 504)));
        sock.once('error', (err) => finish(reject, makeError('FROWSE_UNAVAILABLE', err.message, 503)));
        sock.on('data', (chunk) => {
            buf += chunk.toString('utf8');
            const idx = buf.indexOf('\n');
            if (idx === -1) return;
            try {
                const resp = JSON.parse(buf.slice(0, idx));
                if (resp.ok) finish(resolve, resp.data || {});
                else finish(reject, makeError('FROWSE_COMMAND_FAILED', resp.error || 'Unknown Frowse error', 422));
            } catch (err) {
                finish(reject, makeError('FROWSE_BAD_RESPONSE', err.message, 502));
            }
        });
        sock.once('end', () => finish(reject, makeError('FROWSE_BAD_RESPONSE', 'Empty response from Frowse daemon', 502)));
        sock.once('connect', () => sock.write(JSON.stringify({ action, args: args || {} }) + '\n'));
    });
}

async function runFrowseCommand(session, action, args = {}, options = {}) {
    if (!isValidSessionName(session)) throw makeError('FROWSE_SESSION_INVALID', 'Session must match [A-Za-z0-9_-]{1,64}', 400);
    if (!FROWSE_ACTIONS.includes(action)) throw makeError('FROWSE_ACTION_INVALID', `Unknown Frowse action: ${action}`, 400);

    if (action === 'close') {
        if (!(await isSessionAlive(session))) return { closed: true };
    } else {
        await startSession(session, options);
    }
    return sendToDaemon(session, action, args, options.commandTimeoutMs || DEFAULT_COMMAND_TIMEOUT_MS);
}

async function listFrowseSessions() {
    let entries = [];
    try { entries = fs.readdirSync(getStateDir()); } catch { /* none */ }
    const sessions = [];
    for (const entry of entries) {
        if (!entry.endsWith('.sock')) continue;
        const name = entry.slice(0, -5);
        if (!isValidSessionName(name)) continue;
        sessions.push({ session: name, alive: await isSessionAlive(name) });
    }
    return sessions;
}

async function closeAllFrowseSessions() {
    const closed = [];
    for (const { session, alive } of await listFrowseSessions()) {
        if (!alive) continue;
        try { await runFrowseCommand(session, 'close'); closed.push(session); } catch { /* best effort */ }
    }
    return closed;
}

module.exports = {
    FROWSE_ACTIONS,
    isValidSessionName,
    getFrowseStatus,
    runFrowseCommand,
    listFrowseSessions,
    closeAllFrowseSessions
};
