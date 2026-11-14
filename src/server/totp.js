'use strict';
const crypto = require('crypto');
const { masterKey, seal, open } = require('./secret-store');

// RFC 6238 defaults that every mainstream authenticator app supports.
const PERIOD_SECONDS = 30;
const DIGITS = 6;
// Accept one step either side of "now" to tolerate small clock drift.
const WINDOW_STEPS = 1;
const SECRET_BYTES = 20;
const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

// 32 symbols without look-alikes (0/O, 1/I). 256 % 32 === 0, so byte modulo is unbiased.
const RECOVERY_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const RECOVERY_CODE_COUNT = 10;
const RECOVERY_CODE_LENGTH = 16; // 16 symbols * 5 bits = 80 bits of entropy
const SECRET_CONTEXT = 'figranium:totp-secret:v1';

function base32Encode(buffer) {
    let bits = 0;
    let value = 0;
    let output = '';
    for (const byte of buffer) {
        value = ((value << 8) | byte) & 0xffff;
        bits += 8;
        while (bits >= 5) {
            output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
            bits -= 5;
        }
    }
    if (bits > 0) output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
    return output;
}

function base32Decode(input) {
    const clean = String(input).toUpperCase().replace(/[\s=-]/g, '');
    let bits = 0;
    let value = 0;
    const bytes = [];
    for (const char of clean) {
        const index = BASE32_ALPHABET.indexOf(char);
        if (index === -1) throw new Error('Invalid base32 character');
        value = ((value << 5) | index) & 0xffff;
        bits += 5;
        if (bits >= 8) {
            bytes.push((value >>> (bits - 8)) & 0xff);
            bits -= 8;
        }
    }
    return Buffer.from(bytes);
}

function generateSecret() {
    return base32Encode(crypto.randomBytes(SECRET_BYTES));
}

function currentStep(now = Date.now()) {
    return Math.floor(now / 1000 / PERIOD_SECONDS);
}

// RFC 4226 HOTP: HMAC-SHA1 over the big-endian counter, then dynamic truncation.
function hotp(secret, counter, digits = DIGITS) {
    const counterBuffer = Buffer.alloc(8);
    counterBuffer.writeBigUInt64BE(BigInt(counter));
    const hmac = crypto.createHmac('sha1', secret).update(counterBuffer).digest();
    const offset = hmac[hmac.length - 1] & 0x0f;
    const binary = ((hmac[offset] & 0x7f) << 24)
        | (hmac[offset + 1] << 16)
        | (hmac[offset + 2] << 8)
        | hmac[offset + 3];
    return String(binary % (10 ** digits)).padStart(digits, '0');
}

// Returns the time step that matched, or null. Pass lastUsedStep to reject replays:
// a code that already succeeded must not succeed again within its validity window.
function verifyTotpCode(secretBase32, code, { now = Date.now(), lastUsedStep = -1, digits = DIGITS } = {}) {
    if (typeof code !== 'string' || !new RegExp(`^\\d{${digits}}$`).test(code)) return null;
    const secret = base32Decode(secretBase32);
    const step = currentStep(now);
    const minimumStep = lastUsedStep ?? -1;
    for (let offset = -WINDOW_STEPS; offset <= WINDOW_STEPS; offset += 1) {
        const candidateStep = step + offset;
        if (candidateStep <= minimumStep) continue;
        const expected = Buffer.from(hotp(secret, candidateStep, digits));
        if (crypto.timingSafeEqual(expected, Buffer.from(code))) return candidateStep;
    }
    return null;
}

function buildOtpauthUri({ secret, accountName, issuer = 'Figranium' }) {
    const label = encodeURIComponent(`${issuer}:${accountName}`);
    const params = new URLSearchParams({
        secret,
        issuer,
        algorithm: 'SHA1',
        digits: String(DIGITS),
        period: String(PERIOD_SECONDS)
    });
    return `otpauth://totp/${label}?${params.toString()}`;
}

function normalizeRecoveryCode(value) {
    return String(value).toUpperCase().replace(/[\s-]/g, '');
}

function hashRecoveryCode(value) {
    return crypto.createHash('sha256').update(normalizeRecoveryCode(value)).digest('hex');
}

function generateRecoveryCodes(count = RECOVERY_CODE_COUNT) {
    const codes = [];
    for (let index = 0; index < count; index += 1) {
        let raw = '';
        for (const byte of crypto.randomBytes(RECOVERY_CODE_LENGTH)) {
            raw += RECOVERY_ALPHABET[byte % RECOVERY_ALPHABET.length];
        }
        codes.push(raw.match(/.{1,4}/g).join('-'));
    }
    return codes;
}

// Seal the seed with the instance master key when MASTER_KEY is configured, matching
// the opt-in behavior of secret-store.js. Without it the seed is stored like other
// fields in users.json.
async function sealTotpSecret(secret) {
    if (!process.env.MASTER_KEY) return { secret };
    return { secretEnvelope: seal(secret, await masterKey(), SECRET_CONTEXT) };
}

async function revealTotpSecret(totpState) {
    if (totpState.secretEnvelope) return open(totpState.secretEnvelope, await masterKey(), SECRET_CONTEXT);
    return totpState.secret;
}

module.exports = {
    PERIOD_SECONDS,
    DIGITS,
    RECOVERY_CODE_COUNT,
    base32Encode,
    base32Decode,
    generateSecret,
    currentStep,
    hotp,
    verifyTotpCode,
    buildOtpauthUri,
    normalizeRecoveryCode,
    hashRecoveryCode,
    generateRecoveryCodes,
    sealTotpSecret,
    revealTotpSecret
};
