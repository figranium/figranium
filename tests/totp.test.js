'use strict';
// Unit tests for src/server/totp.js. Run with: node tests/totp.test.js
const assert = require('assert');
const totp = require('../src/server/totp');

const results = [];
async function test(name, fn) {
    try {
        await fn();
        results.push({ name, ok: true });
        console.log(`PASS ${name}`);
    } catch (error) {
        results.push({ name, ok: false, error });
        console.error(`FAIL ${name}\n  ${error.message}`);
    }
}

// RFC 6238 Appendix B: SHA-1 key "12345678901234567890", 8-digit codes.
const RFC_KEY = Buffer.from('12345678901234567890');
const RFC_VECTORS = [
    [59, '94287082'],
    [1111111109, '07081804'],
    [1111111111, '14050471'],
    [1234567890, '89005924'],
    [2000000000, '69279037'],
    [20000000000, '65353130']
];

(async () => {
    await test('HOTP/TOTP match RFC 6238 SHA-1 test vectors', () => {
        for (const [seconds, expected] of RFC_VECTORS) {
            const counter = Math.floor(seconds / totp.PERIOD_SECONDS);
            assert.strictEqual(totp.hotp(RFC_KEY, counter, 8), expected, `T=${seconds}`);
        }
    });

    await test('base32 encoding matches the RFC key and round-trips random bytes', () => {
        assert.strictEqual(totp.base32Encode(RFC_KEY), 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ');
        const bytes = require('crypto').randomBytes(37);
        assert.deepStrictEqual(totp.base32Decode(totp.base32Encode(bytes)), bytes);
    });

    await test('generated secrets are 32 base32 characters', () => {
        const secret = totp.generateSecret();
        assert.match(secret, /^[A-Z2-7]{32}$/);
    });

    await test('verifyTotpCode accepts the current code and returns its time step', () => {
        const secret = totp.generateSecret();
        const now = Date.now();
        const code = totp.hotp(totp.base32Decode(secret), totp.currentStep(now));
        assert.strictEqual(totp.verifyTotpCode(secret, code, { now }), totp.currentStep(now));
    });

    await test('verifyTotpCode tolerates one step of clock drift in either direction', () => {
        const secret = totp.generateSecret();
        const key = totp.base32Decode(secret);
        const now = 1_700_000_000_000;
        const step = totp.currentStep(now);
        const previous = totp.hotp(key, step - 1);
        const next = totp.hotp(key, step + 1);
        assert.strictEqual(totp.verifyTotpCode(secret, previous, { now }), step - 1);
        assert.strictEqual(totp.verifyTotpCode(secret, next, { now }), step + 1);
    });

    await test('verifyTotpCode rejects codes outside the window', () => {
        const secret = totp.generateSecret();
        const key = totp.base32Decode(secret);
        const now = 1_700_000_000_000;
        const far = totp.hotp(key, totp.currentStep(now) + 5);
        assert.strictEqual(totp.verifyTotpCode(secret, far, { now }), null);
    });

    await test('verifyTotpCode rejects replays at or before lastUsedStep', () => {
        const secret = totp.generateSecret();
        const key = totp.base32Decode(secret);
        const now = 1_700_000_000_000;
        const step = totp.currentStep(now);
        const code = totp.hotp(key, step);
        assert.strictEqual(totp.verifyTotpCode(secret, code, { now, lastUsedStep: step }), null);
        assert.strictEqual(totp.verifyTotpCode(secret, code, { now, lastUsedStep: step - 1 }), step);
    });

    await test('verifyTotpCode rejects malformed input without throwing', () => {
        const secret = totp.generateSecret();
        for (const bad of ['', '12345', '1234567', 'abcdef', '12 456', null, undefined, 123456]) {
            assert.strictEqual(totp.verifyTotpCode(secret, bad), null, `input ${String(bad)}`);
        }
    });

    await test('otpauth URI carries the secret, issuer and RFC defaults', () => {
        const uri = totp.buildOtpauthUri({ secret: 'ABCDEFGH', accountName: 'user@example.com' });
        const parsed = new URL(uri);
        assert.strictEqual(parsed.protocol, 'otpauth:');
        assert.strictEqual(parsed.host, 'totp');
        assert.strictEqual(parsed.searchParams.get('secret'), 'ABCDEFGH');
        assert.strictEqual(parsed.searchParams.get('issuer'), 'Figranium');
        assert.strictEqual(parsed.searchParams.get('digits'), '6');
        assert.strictEqual(parsed.searchParams.get('period'), '30');
    });

    await test('recovery codes are unique, formatted and hash independent of dashes and case', () => {
        const codes = totp.generateRecoveryCodes();
        assert.strictEqual(codes.length, totp.RECOVERY_CODE_COUNT);
        assert.strictEqual(new Set(codes).size, codes.length);
        for (const code of codes) assert.match(code, /^[A-HJ-NP-Z2-9]{4}(-[A-HJ-NP-Z2-9]{4}){3}$/);
        const plain = codes[0].replace(/-/g, '').toLowerCase();
        assert.strictEqual(totp.hashRecoveryCode(plain), totp.hashRecoveryCode(codes[0]));
        assert.notStrictEqual(totp.hashRecoveryCode(codes[0]), totp.hashRecoveryCode(codes[1]));
    });

    await test('secrets are stored in plaintext when MASTER_KEY is not configured', async () => {
        const previous = process.env.MASTER_KEY;
        delete process.env.MASTER_KEY;
        try {
            const sealed = await totp.sealTotpSecret('ABCDEFGHIJKLMNOPQRST');
            assert.deepStrictEqual(sealed, { secret: 'ABCDEFGHIJKLMNOPQRST' });
            assert.strictEqual(await totp.revealTotpSecret(sealed), 'ABCDEFGHIJKLMNOPQRST');
        } finally {
            if (previous === undefined) delete process.env.MASTER_KEY;
            else process.env.MASTER_KEY = previous;
        }
    });

    await test('secrets are encrypted at rest and revealed when MASTER_KEY is configured', async () => {
        const previous = process.env.MASTER_KEY;
        process.env.MASTER_KEY = '11'.repeat(32);
        try {
            const sealed = await totp.sealTotpSecret('ABCDEFGHIJKLMNOPQRST');
            assert.ok(sealed.secretEnvelope, 'expected an encrypted envelope');
            assert.strictEqual(sealed.secret, undefined);
            assert.ok(!JSON.stringify(sealed).includes('ABCDEFGHIJKLMNOPQRST'), 'plaintext must not appear');
            assert.strictEqual(await totp.revealTotpSecret(sealed), 'ABCDEFGHIJKLMNOPQRST');
        } finally {
            if (previous === undefined) delete process.env.MASTER_KEY;
            else process.env.MASTER_KEY = previous;
        }
    });

    const failed = results.filter((result) => !result.ok);
    console.log(`\n${results.length - failed.length}/${results.length} TOTP tests passed`);
    process.exit(failed.length === 0 ? 0 : 1);
})();
