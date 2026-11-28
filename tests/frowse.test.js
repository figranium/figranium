'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');

const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'frowse-test-'));
process.env.FROWSE_STATE_DIR = stateDir;

// Bypass auth for route tests.
const middlewarePath = require.resolve('../src/server/middleware');
const real = require(middlewarePath);
require.cache[middlewarePath].exports = {
    ...real,
    requireAuthOrApiKey: (_req, _res, next) => next(),
    requireScopedPermission: () => (_req, _res, next) => next(),
    dataRateLimiter: (_req, _res, next) => next()
};

const express = require('express');
const frowseRouter = require('../src/server/routes/frowse');
const { FROWSE_ACTIONS, isValidSessionName } = require('../src/agent/figranite/frowse-client');

// Fake Frowse daemon speaking the JSON-line protocol.
function startFakeDaemon(session, calls) {
    const sock = path.join(stateDir, `${session}.sock`);
    const server = net.createServer((conn) => {
        let buf = '';
        conn.on('data', (d) => {
            buf += d;
            if (!buf.includes('\n')) return;
            const req = JSON.parse(buf.split('\n')[0]);
            if (req.action === 'probe-only') return conn.end();
            calls.push(req);
            let resp = { ok: true, data: { echoed: req.action } };
            if (req.action === 'screenshot') {
                fs.writeFileSync(req.args.path, Buffer.from('PNGDATA'));
                resp = { ok: true, data: { path: req.args.path } };
            }
            if (req.action === 'click' && req.args.selector === 'boom') resp = { ok: false, error: 'no match' };
            conn.end(JSON.stringify(resp) + '\n');
        });
    });
    return new Promise((r) => server.listen(sock, () => r(server)));
}

function request(port, method, p, body) {
    return new Promise((resolve, reject) => {
        const data = body ? JSON.stringify(body) : '';
        const req = http.request({ host: '127.0.0.1', port, path: p, method, headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } }, (res) => {
            let out = '';
            res.on('data', (c) => { out += c; });
            res.on('end', () => resolve({ status: res.statusCode, body: out ? JSON.parse(out) : null }));
        });
        req.on('error', reject);
        req.end(data);
    });
}

test('session names and action list', () => {
    assert.equal(isValidSessionName('agent-1'), true);
    assert.equal(isValidSessionName('../etc'), false);
    assert.ok(FROWSE_ACTIONS.includes('snapshot'));
    assert.ok(FROWSE_ACTIONS.includes('query'));
});

test('frowse routes relay commands to the session daemon', async () => {
    const calls = [];
    const daemon = await startFakeDaemon('s1', calls);
    const app = express();
    app.use(express.json());
    app.use('/api/frowse', frowseRouter);
    const web = await new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
    const port = web.address().port;
    try {
        let r = await request(port, 'POST', '/api/frowse/sessions/s1/commands', { action: 'click', args: { selector: 'Sign in button' } });
        assert.equal(r.status, 200);
        assert.deepEqual(r.body.result, { echoed: 'click' });
        assert.deepEqual(calls[0], { action: 'click', args: { selector: 'Sign in button' } });

        r = await request(port, 'POST', '/api/frowse/sessions/s1/fill', { selector: '#q', text: 'hi' });
        assert.equal(r.status, 200);
        assert.deepEqual(calls[1].args, { selector: '#q', text: 'hi' });

        r = await request(port, 'POST', '/api/frowse/sessions/s1/click', { selector: 'boom' });
        assert.equal(r.status, 422);
        assert.equal(r.body.error, 'FROWSE_COMMAND_FAILED');

        r = await request(port, 'POST', '/api/frowse/sessions/s1/nope', {});
        assert.equal(r.status, 400);
        r = await request(port, 'POST', '/api/frowse/sessions/..%2Fx/click', {});
        assert.equal(r.status, 400);

        // SSRF guard on navigation
        r = await request(port, 'POST', '/api/frowse/sessions/s1/open', { url: 'http://127.0.0.1:11345/' });
        assert.equal(r.status, 400);
        r = await request(port, 'POST', '/api/frowse/sessions/s1/open', { url: 'file:///etc/passwd' });
        assert.equal(r.status, 400);

        // Screenshot path is server-chosen and returned inline as base64
        r = await request(port, 'POST', '/api/frowse/sessions/s1/screenshot', { path: '/etc/evil.png' });
        assert.equal(r.status, 200);
        assert.equal(r.body.result.mimeType, 'image/png');
        assert.equal(Buffer.from(r.body.result.data, 'base64').toString(), 'PNGDATA');
        assert.notEqual(calls.at(-1).args.path, '/etc/evil.png');

        // Uploads confined to the upload dir
        r = await request(port, 'POST', '/api/frowse/sessions/s1/upload', { selector: 'input', files: ['/etc/passwd'] });
        assert.equal(r.status, 400);

        // Daemon-start options are sanitized
        r = await request(port, 'POST', '/api/frowse/sessions/s1/get', { prop: 'title', options: { timeoutMs: 5 } });
        assert.equal(r.status, 400);

        r = await request(port, 'GET', '/api/frowse/sessions');
        assert.equal(r.status, 200);
        assert.ok(r.body.sessions.some((s) => s.session === 's1' && s.alive));

        r = await request(port, 'DELETE', '/api/frowse/sessions/s1');
        assert.equal(r.status, 200);
        assert.equal(calls.at(-1).action, 'close');
    } finally {
        web.close();
        daemon.close();
        fs.rmSync(stateDir, { recursive: true, force: true });
    }
});
