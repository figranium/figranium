'use strict';
// Integration tests for two-factor authentication in src/server/routes/auth.js.
// The real router and express-session (in-memory store) run on an ephemeral port. Storage and
// rate limiting are replaced with in-memory stand-ins, so this never reads or writes data/.
// Run with: node tests/auth_2fa.test.js
const assert = require('assert');
const express = require('express');
const session = require('express-session');

process.env.MASTER_KEY = '22'.repeat(32); // exercise the encrypted-seed path
const totp = require('../src/server/totp');

let users = [];
const storageFile = require.resolve('../src/server/storage');
const middlewareFile = require.resolve('../src/server/middleware');
require.cache[storageFile] = {
    id: storageFile,
    filename: storageFile,
    loaded: true,
    exports: {
        loadUsers: async () => users,
        saveUsers: async (next) => { users = next; },
        saveSession: (req) => new Promise((resolve, reject) => {
            req.session.save((err) => (err ? reject(err) : resolve()));
        })
    }
};
require.cache[middlewareFile] = {
    id: middlewareFile,
    filename: middlewareFile,
    loaded: true,
    exports: { authRateLimiter: (req, res, next) => next() }
};

const authRoutes = require('../src/server/routes/auth');

const app = express();
app.use(express.json());
app.use(session({
    secret: 'integration-test-secret',
    resave: false,
    saveUninitialized: false,
    cookie: { httpOnly: true, sameSite: 'strict' }
}));
app.use('/api/auth', authRoutes);

const EMAIL = 'owner@example.com';
const PASSWORD = 'correct horse battery';

let base = '';
async function call(method, route, { body, cookie } = {}) {
    const headers = { 'Content-Type': 'application/json' };
    if (cookie) headers.Cookie = cookie;
    const response = await fetch(`${base}/api/auth${route}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body)
    });
    const setCookie = response.headers.get('set-cookie');
    const data = await response.json().catch(() => ({}));
    return {
        status: response.status,
        data,
        cookie: setCookie ? setCookie.split(';')[0] : cookie || null
    };
}

const codeAt = (secret, step) => totp.hotp(totp.base32Decode(secret), step);
// A six-digit code that is not valid anywhere in the current acceptance window.
function codeOutsideWindow(secret) {
    const step = totp.currentStep();
    const valid = [step - 1, step, step + 1].map((candidate) => codeAt(secret, candidate));
    return ['000000', '111111'].find((candidate) => !valid.includes(candidate));
}

let failures = 0;
async function step(name, fn) {
    try {
        await fn();
        console.log(`PASS ${name}`);
    } catch (error) {
        failures += 1;
        console.error(`FAIL ${name}\n  ${error.message}`);
        throw error;
    }
}

(async () => {
    const server = app.listen(0, '127.0.0.1');
    await new Promise((resolve) => server.once('listening', resolve));
    base = `http://127.0.0.1:${server.address().port}`;
    try {
        let owner = null;      // cookie of the signed-in session
        let secret = null;     // pending/enabled TOTP secret (test-only copy)
        let enrollmentStep = null; // time step of the code that enabled 2FA
        let recoveryCodes = [];
        let legacyRecoveryCodes = [];

        await step('first-run setup creates the account', async () => {
            const res = await call('POST', '/setup', { body: { name: 'Owner', email: EMAIL, password: PASSWORD } });
            assert.strictEqual(res.status, 200);
            owner = res.cookie;
        });

        await step('two-factor is off by default', async () => {
            const res = await call('GET', '/2fa', { cookie: owner });
            assert.deepStrictEqual(res.data, { enabled: false, recoveryCodesRemaining: 0 });
        });

        await step('enrollment status requires a signed-in session', async () => {
            const res = await call('GET', '/2fa');
            assert.strictEqual(res.status, 401);
        });

        await step('enrollment setup rejects a wrong password', async () => {
            const res = await call('POST', '/2fa/setup', { cookie: owner, body: { currentPassword: 'nope' } });
            assert.strictEqual(res.status, 401);
            assert.strictEqual(res.data.error, 'INVALID_CURRENT_PASSWORD');
        });

        await step('enrollment setup issues a pending secret and otpauth URI', async () => {
            const res = await call('POST', '/2fa/setup', { cookie: owner, body: { currentPassword: PASSWORD } });
            assert.strictEqual(res.status, 200);
            secret = res.data.secret;
            assert.match(secret, /^[A-Z2-7]{32}$/);
            assert.ok(res.data.otpauthUri.startsWith('otpauth://totp/'));
            assert.strictEqual(users[0].totp, undefined, 'nothing is saved before the code is confirmed');
        });

        await step('enrollment rejects an incorrect code', async () => {
            const res = await call('POST', '/2fa/enable', { cookie: owner, body: { code: codeOutsideWindow(secret) } });
            assert.strictEqual(res.status, 401);
            assert.strictEqual(res.data.error, 'INVALID_TWO_FACTOR_CODE');
        });

        await step('enrollment accepts a correct code and returns recovery codes once', async () => {
            enrollmentStep = totp.currentStep();
            const res = await call('POST', '/2fa/enable', {
                cookie: owner,
                body: { code: codeAt(secret, enrollmentStep) }
            });
            assert.strictEqual(res.status, 200);
            recoveryCodes = res.data.recoveryCodes;
            assert.strictEqual(recoveryCodes.length, totp.RECOVERY_CODE_COUNT);
        });

        await step('stored record keeps only hashes and an encrypted seed', async () => {
            const stored = users[0].totp;
            assert.strictEqual(stored.enabled, true);
            assert.strictEqual(stored.secret, undefined);
            assert.ok(stored.secretEnvelope, 'seed should be sealed when MASTER_KEY is set');
            assert.strictEqual(stored.recoveryCodeHashes.length, totp.RECOVERY_CODE_COUNT);
            const serialized = JSON.stringify(users);
            assert.ok(!serialized.includes(secret), 'plaintext seed must not be stored');
            assert.ok(!serialized.includes(recoveryCodes[0]), 'plaintext recovery code must not be stored');
        });

        await step('enabling twice is refused', async () => {
            const res = await call('POST', '/2fa/setup', { cookie: owner, body: { currentPassword: PASSWORD } });
            assert.strictEqual(res.status, 409);
        });

        await step('password alone no longer signs in; a second factor is requested', async () => {
            const res = await call('POST', '/login', { body: { email: EMAIL, password: PASSWORD } });
            assert.strictEqual(res.status, 200);
            assert.deepStrictEqual(res.data, { twoFactorRequired: true });
            const me = await call('GET', '/me', { cookie: res.cookie });
            assert.strictEqual(me.data.authenticated, false);
            owner = res.cookie; // pending challenge session
        });

        await step('an incorrect second-factor code is rejected', async () => {
            const res = await call('POST', '/login/2fa', { cookie: owner, body: { code: codeOutsideWindow(secret) } });
            assert.strictEqual(res.status, 401);
            assert.strictEqual(res.data.error, 'INVALID_TWO_FACTOR_CODE');
        });

        await step('the enrollment code cannot be replayed at sign-in', async () => {
            const res = await call('POST', '/login/2fa', {
                cookie: owner,
                body: { code: codeAt(secret, enrollmentStep) }
            });
            assert.strictEqual(res.status, 401);
        });

        await step('a fresh authenticator code completes sign-in', async () => {
            const res = await call('POST', '/login/2fa', {
                cookie: owner,
                body: { code: codeAt(secret, totp.currentStep() + 1) }
            });
            assert.strictEqual(res.status, 200);
            assert.strictEqual(res.data.success, true);
            owner = res.cookie;
            const me = await call('GET', '/me', { cookie: owner });
            assert.strictEqual(me.data.authenticated, true);
            assert.strictEqual(me.data.user.email, EMAIL);
        });

        await step('a recovery code signs in once and is then consumed', async () => {
            const first = await call('POST', '/login', { body: { email: EMAIL, password: PASSWORD } });
            const ok = await call('POST', '/login/2fa', { cookie: first.cookie, body: { code: recoveryCodes[0] } });
            assert.strictEqual(ok.status, 200);

            const again = await call('POST', '/login', { body: { email: EMAIL, password: PASSWORD } });
            const reused = await call('POST', '/login/2fa', { cookie: again.cookie, body: { code: recoveryCodes[0] } });
            assert.strictEqual(reused.status, 401);

            owner = ok.cookie;
            const status = await call('GET', '/2fa', { cookie: owner });
            assert.strictEqual(status.data.recoveryCodesRemaining, totp.RECOVERY_CODE_COUNT - 1);
        });

        await step('regenerating recovery codes requires the password and a current factor', async () => {
            const wrongPassword = await call('POST', '/2fa/recovery-codes', {
                cookie: owner,
                body: { currentPassword: 'nope', code: recoveryCodes[1] }
            });
            assert.strictEqual(wrongPassword.status, 401);

            const res = await call('POST', '/2fa/recovery-codes', {
                cookie: owner,
                body: { currentPassword: PASSWORD, code: recoveryCodes[1] }
            });
            assert.strictEqual(res.status, 200);
            assert.strictEqual(res.data.recoveryCodes.length, totp.RECOVERY_CODE_COUNT);
            legacyRecoveryCodes = recoveryCodes;
            recoveryCodes = res.data.recoveryCodes;
        });

        await step('codes from before regeneration no longer sign in', async () => {
            const login = await call('POST', '/login', { body: { email: EMAIL, password: PASSWORD } });
            const res = await call('POST', '/login/2fa', { cookie: login.cookie, body: { code: legacyRecoveryCodes[2] } });
            assert.strictEqual(res.status, 401);
        });

        await step('concurrent submissions of one recovery code allow exactly one sign-in', async () => {
            const pending = await Promise.all([
                call('POST', '/login', { body: { email: EMAIL, password: PASSWORD } }),
                call('POST', '/login', { body: { email: EMAIL, password: PASSWORD } })
            ]);
            const results = await Promise.all(pending.map((login) => call('POST', '/login/2fa', {
                cookie: login.cookie,
                body: { code: recoveryCodes[0] }
            })));
            assert.strictEqual(results.filter((r) => r.status === 200).length, 1, `statuses: ${results.map((r) => r.status)}`);
            owner = results.find((r) => r.status === 200).cookie;
        });

        await step('repeated failures lock the second factor for the account', async () => {
            // The failure counter is per account and resets only on success, so earlier wrong codes
            // count toward the limit. Assert the contract, not the exact number of attempts.
            const login = await call('POST', '/login', { body: { email: EMAIL, password: PASSWORD } });
            const wrong = codeOutsideWindow(secret);
            const statuses = [];
            for (let attempt = 0; attempt < 6; attempt += 1) {
                statuses.push((await call('POST', '/login/2fa', { cookie: login.cookie, body: { code: wrong } })).status);
            }
            const firstLocked = statuses.indexOf(429);
            assert.ok(firstLocked > 0 && firstLocked <= 5, `expected lockout within five failures, got ${statuses}`);
            assert.ok(statuses.slice(firstLocked).every((status) => status === 429), `expected 429 once locked, got ${statuses}`);
            const correct = await call('POST', '/login/2fa', {
                cookie: login.cookie,
                body: { code: codeAt(secret, totp.currentStep() + 1) }
            });
            assert.strictEqual(correct.status, 429, 'a correct code must not bypass the lockout');
            assert.strictEqual(correct.data.error, 'TWO_FACTOR_LOCKED');
            users[0].totp.lockedUntil = 0; // stand-in for waiting out the lockout window
        });

        await step('concurrent submissions of one authenticator code allow exactly one sign-in', async () => {
            // Simulate time passing so the replay marker sits before the current acceptance window.
            users[0].totp.lastUsedStep = totp.currentStep() - 2;
            const pending = await Promise.all([
                call('POST', '/login', { body: { email: EMAIL, password: PASSWORD } }),
                call('POST', '/login', { body: { email: EMAIL, password: PASSWORD } })
            ]);
            const code = codeAt(secret, totp.currentStep());
            const results = await Promise.all(pending.map((login) => call('POST', '/login/2fa', {
                cookie: login.cookie,
                body: { code }
            })));
            assert.strictEqual(results.filter((r) => r.status === 200).length, 1, `statuses: ${results.map((r) => r.status)}`);
            owner = results.find((r) => r.status === 200).cookie;
        });

        await step('a pending challenge without a password step is rejected', async () => {
            const res = await call('POST', '/login/2fa', { body: { code: '123456' } });
            assert.strictEqual(res.status, 401);
            assert.strictEqual(res.data.error, 'TWO_FACTOR_EXPIRED');
        });

        await step('disabling needs the password and a valid factor', async () => {
            const badPassword = await call('POST', '/2fa/disable', {
                cookie: owner,
                body: { currentPassword: 'nope', code: recoveryCodes[3] }
            });
            assert.strictEqual(badPassword.status, 401);
            const badCode = await call('POST', '/2fa/disable', {
                cookie: owner,
                body: { currentPassword: PASSWORD, code: codeOutsideWindow(secret) }
            });
            assert.strictEqual(badCode.status, 401);
        });

        await step('disabling with a recovery code restores password-only sign-in', async () => {
            const res = await call('POST', '/2fa/disable', {
                cookie: owner,
                body: { currentPassword: PASSWORD, code: recoveryCodes[3] }
            });
            assert.strictEqual(res.status, 200);
            assert.strictEqual(users[0].totp, undefined);
            const login = await call('POST', '/login', { body: { email: EMAIL, password: PASSWORD } });
            assert.strictEqual(login.data.success, true);
            assert.strictEqual(login.data.twoFactorRequired, undefined);
        });
    } finally {
        server.close();
    }
    console.log(failures === 0 ? '\nAll two-factor integration tests passed' : `\n${failures} failure(s)`);
    process.exit(failures === 0 ? 0 : 1);
})().catch((error) => {
    console.error(error);
    process.exit(1);
});
