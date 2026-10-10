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

const { requireApiKey, requireApiPermission } = require('../src/server/middleware');

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

(async () => {
    try {
        await check(secret, 200);
        await check('wrong-key', 401);
        console.log('API key middleware accepts valid keys and rejects invalid keys');
    } finally {
        fs.promises.readFile = readFile;
    }
})().catch(error => { console.error(error); process.exitCode = 1; });
