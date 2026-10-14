const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const { API_KEYS_FILE } = require('../src/server/constants');

const secret = 'regression-test-api-key';
const salt = 'regression-test-salt';
const key = {
    id: 'key_test',
    salt,
    hash: crypto.scryptSync(secret, salt, 64).toString('hex'),
    permissions: ['tasks:read'],
    taskIds: []
};

const readFile = fs.promises.readFile;
fs.promises.readFile = async (file, ...args) => {
    if (file === API_KEYS_FILE) return JSON.stringify([key]);
    return readFile.call(fs.promises, file, ...args);
};

const { requireApiKey, requireApiPermission, requireScopedPermission, requireUnscopedGlobalAccess } = require('../src/server/middleware');

async function check(value, expectedStatus) {
    const req = {
        get: name => name === 'x-api-key' ? value : null,
        body: {},
        ip: '127.0.0.1',
        socket: { remoteAddress: '127.0.0.1' },
        params: {}
    };
    const res = {
        locals: {},
        status(code) { this.statusCode = code; return this; },
        json(body) { this.body = body; return this; }
    };
    let continued = false;
    await requireApiKey(req, res, () => { continued = true; });
    if (expectedStatus === 200) {
        assert.equal(continued, true);
        assert.equal(req.apiKey.id, key.id);
        assert.equal(res.locals.figraniumActivity, 'api');
        requireApiPermission('tasks:read')(req, res, () => { req.authorized = true; });
        assert.equal(req.authorized, true);
    } else {
        assert.equal(continued, false);
        assert.equal(res.statusCode, expectedStatus);
    }
}

function checkManageOnlyRoute(permissions, expectedStatus) {
    const req = { apiKey: { permissions, taskIds: [] }, params: {} };
    const res = {
        status(code) { this.statusCode = code; return this; },
        json(body) { this.body = body; return this; }
    };
    let continued = false;
    requireScopedPermission('tasks:manage')(req, res, () => { continued = true; });
    assert.equal(res.statusCode || 200, expectedStatus);
    assert.equal(continued, expectedStatus === 200);
    if (expectedStatus === 403) assert.equal(res.body?.error, 'API_KEY_FORBIDDEN');
}

(async () => {
    try {
        await check(secret, 200);
        await check('wrong-key', 401);
        checkManageOnlyRoute(['tasks:read'], 403);
        checkManageOnlyRoute(['tasks:run'], 403);
        checkManageOnlyRoute(['tasks:manage'], 200);
        for (const [body, allowed] of [[{ id: 'task_allowed' }, true], [{ id: 'task_other' }, false], [{}, false]]) {
            const req = { apiKey: { permissions: ['tasks:manage'], taskIds: ['task_allowed'] }, params: {}, body };
            const res = { status(code) { this.statusCode = code; return this; }, json(value) { this.body = value; return this; } };
            let continued = false;
            requireScopedPermission('tasks:manage', { taskBody: 'id' })(req, res, () => { continued = true; });
            assert.equal(continued, allowed);
            assert.equal(res.statusCode || 200, allowed ? 200 : 403);
            if (!allowed) assert.equal(res.body.error, 'TASK_NOT_ALLOWED');
        }
        // Global captures, Cabinets and browser control have no Task ownership.
        for (const [apiKey, allowed] of [
            [{ permissions: ['tasks:manage'], taskIds: ['task_allowed'] }, false],
            [{ permissions: ['tasks:manage'], taskIds: [] }, true],
            [null, true] // UI session; preceding authentication remains required.
        ]) {
            const req = { apiKey };
            const res = { status(code) { this.statusCode = code; return this; }, json(value) { this.body = value; return this; } };
            let continued = false;
            requireUnscopedGlobalAccess(req, res, () => { continued = true; });
            assert.equal(continued, allowed);
            assert.equal(res.statusCode || 200, allowed ? 200 : 403);
            if (!allowed) assert.equal(res.body.error, 'TASK_NOT_ALLOWED');
        }
        // Guard route wiring, not only the middleware function.
        for (const [file, routeCount] of [
            ['src/server/routes/data.js', 2],
            ['src/server/routes/cabinets.js', 3],
            ['src/server/routes/browser.js', 2],
            ['server.js', 3]
        ]) {
            const source = fs.readFileSync(require('node:path').join(__dirname, '..', file), 'utf8');
            const matches = source.match(/requireScopedPermission\('tasks:manage'\), requireUnscopedGlobalAccess,/g) || [];
            assert.equal(matches.length, routeCount, file + ' must guard every global API-key route');
        }
        console.log('API key middleware accepts valid keys and rejects invalid keys');
    } finally {
        fs.promises.readFile = readFile;
    }
})().catch(error => { console.error(error); process.exitCode = 1; });
