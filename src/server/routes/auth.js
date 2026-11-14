const express = require('express');
const bcrypt = require('bcryptjs');
const { loadUsers, saveUsers, saveSession } = require('../storage');
const { authRateLimiter } = require('../middleware');
const totp = require('../totp');

const router = express.Router();

const TWO_FACTOR_LOGIN_TTL_MS = 5 * 60 * 1000;
const TWO_FACTOR_SETUP_TTL_MS = 10 * 60 * 1000;
const TWO_FACTOR_MAX_FAILURES = 5;
const TWO_FACTOR_LOCKOUT_MS = 15 * 60 * 1000;
const MAX_CODE_INPUT_LENGTH = 64;

const findUserById = (users, id) => users.find((candidate) => String(candidate.id) === String(id));
const isTwoFactorLockedOut = (totpState) => Boolean(totpState?.lockedUntil && totpState.lockedUntil > Date.now());

function establishSession(req, res, user) {
    req.session.regenerate(async (err) => {
        if (err) {
            console.error('[AUTH] Login session regenerate failed:', err);
            return res.status(500).json({ error: 'SESSION_REGENERATE_FAILED' });
        }
        req.session.user = { id: user.id, name: user.name, email: user.email };
        try {
            await saveSession(req);
            res.json({ success: true, user: req.session.user });
        } catch (saveErr) {
            console.error('[AUTH] Login session save failed:', saveErr);
            return res.status(500).json({ error: 'SESSION_SAVE_FAILED' });
        }
    });
}

// The password was correct but a second factor is still required. Keep only a short-lived
// marker in a fresh session; the user is not signed in until the code is verified.
function beginTwoFactorChallenge(req, res, user) {
    req.session.regenerate(async (err) => {
        if (err) {
            console.error('[AUTH] Two-factor session regenerate failed:', err);
            return res.status(500).json({ error: 'SESSION_REGENERATE_FAILED' });
        }
        req.session.pendingTwoFactor = { userId: user.id, expiresAt: Date.now() + TWO_FACTOR_LOGIN_TTL_MS };
        try {
            await saveSession(req);
            res.json({ twoFactorRequired: true });
        } catch (saveErr) {
            console.error('[AUTH] Two-factor session save failed:', saveErr);
            return res.status(500).json({ error: 'SESSION_SAVE_FAILED' });
        }
    });
}

// Accepts a 6-digit authenticator code or a single-use recovery code. Mutates the user record;
// attemptSecondFactor persists it.
async function checkSecondFactor(user, rawCode) {
    const state = user.totp;
    const compact = rawCode.replace(/\s/g, '');
    if (/^\d{6}$/.test(compact)) {
        // Await the secret first, then verify and record the step with no further await, so two
        // concurrent requests cannot both spend the same code.
        const secret = await totp.revealTotpSecret(state);
        const step = totp.verifyTotpCode(secret, compact, { lastUsedStep: state.lastUsedStep });
        if (step === null) return false;
        state.lastUsedStep = step;
        return true;
    }
    const index = (state.recoveryCodeHashes || []).indexOf(totp.hashRecoveryCode(compact));
    if (index === -1) return false;
    state.recoveryCodeHashes.splice(index, 1);
    return true;
}

// Records one second-factor attempt, applies the per-account lockout and persists the user.
// Returns 'accepted', 'rejected' or 'locked'.
async function attemptSecondFactor(users, user, rawCode) {
    if (isTwoFactorLockedOut(user.totp)) return 'locked';
    const accepted = await checkSecondFactor(user, rawCode);
    if (accepted) {
        user.totp.failedAttempts = 0;
        delete user.totp.lockedUntil;
    } else {
        user.totp.failedAttempts = (user.totp.failedAttempts || 0) + 1;
        if (user.totp.failedAttempts >= TWO_FACTOR_MAX_FAILURES) {
            user.totp.lockedUntil = Date.now() + TWO_FACTOR_LOCKOUT_MS;
            user.totp.failedAttempts = 0;
        }
    }
    await saveUsers(users);
    return accepted ? 'accepted' : 'rejected';
}

// Guard for changes that need the account password and a current second factor (disabling 2FA,
// regenerating recovery codes). Sends the error response itself and returns null on failure.
async function verifyAccountTwoFactorChange(req, res) {
    const userId = req.session?.user?.id;
    if (!userId) {
        res.status(401).json({ error: 'UNAUTHORIZED' });
        return null;
    }
    const { currentPassword, code } = req.body || {};
    if (typeof currentPassword !== 'string' || typeof code !== 'string' || code.length > MAX_CODE_INPUT_LENGTH) {
        res.status(400).json({ error: 'INVALID_INPUT_TYPE' });
        return null;
    }
    const users = await loadUsers();
    const user = findUserById(users, userId);
    if (!user?.totp?.enabled) {
        res.status(400).json({ error: 'TWO_FACTOR_NOT_ENABLED' });
        return null;
    }
    if (!await bcrypt.compare(currentPassword, user.password)) {
        res.status(401).json({ error: 'INVALID_CURRENT_PASSWORD' });
        return null;
    }
    const outcome = await attemptSecondFactor(users, user, code);
    if (outcome === 'locked') {
        res.status(429).json({ error: 'TWO_FACTOR_LOCKED' });
        return null;
    }
    if (outcome === 'rejected') {
        res.status(401).json({ error: 'INVALID_TWO_FACTOR_CODE' });
        return null;
    }
    return { users, user };
}

router.get('/check-setup', authRateLimiter, async (req, res) => {
    try {
        const users = await loadUsers();
        res.json({ setupRequired: users.length === 0 });
    } catch (e) {
        console.error('[AUTH] check-setup error:', e);
        res.status(500).json({ error: 'INTERNAL_ERROR' });
    }
});

router.post('/setup', authRateLimiter, async (req, res) => {
    const users = await loadUsers();
    if (users.length > 0) return res.status(403).json({ error: 'ALREADY_SETUP' });
    const { name, email, password } = req.body;

    // Strict type and length validation
    if (typeof name !== 'string' || typeof email !== 'string' || typeof password !== 'string') {
        return res.status(400).json({ error: 'INVALID_INPUT_TYPE', message: 'Name, email, and password must be strings.' });
    }

    const trimmedName = name.trim();
    const normalizedEmail = email.trim().toLowerCase();

    if (!trimmedName || !normalizedEmail || !password) {
        return res.status(400).json({ error: 'MISSING_FIELDS' });
    }

    if (trimmedName.length > 100) {
        return res.status(400).json({ error: 'NAME_TOO_LONG', message: 'Name must be 100 characters or less.' });
    }

    // Basic email validation: limit length and use a ReDoS-safe regex.
    if (normalizedEmail.length > 255 || !/^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/.test(normalizedEmail)) {
        return res.status(400).json({ error: 'INVALID_EMAIL' });
    }

    // Enforce password length constraints
    if (password.length < 8) {
        return res.status(400).json({ error: 'PASSWORD_TOO_SHORT' });
    }
    if (password.length > 128) {
        return res.status(400).json({ error: 'PASSWORD_TOO_LONG', message: 'Password must be 128 characters or less.' });
    }

    const hashedPassword = await bcrypt.hash(password, 12);
    const newUser = { id: Date.now(), name: trimmedName, email: normalizedEmail, password: hashedPassword };
    await saveUsers([newUser]);


    req.session.regenerate(async (err) => {
        if (err) {
            console.error('[AUTH] Setup session regenerate failed:', err);
            return res.status(500).json({ error: 'SESSION_REGENERATE_FAILED' });
        }
        req.session.user = { id: newUser.id, name: newUser.name, email: newUser.email };
        try {
            await saveSession(req);
            res.json({ success: true });
        } catch (saveErr) {
            console.error('[AUTH] Setup session save failed:', saveErr);
            return res.status(500).json({ error: 'SESSION_SAVE_FAILED' });
        }
    });
});

router.post('/login', authRateLimiter, async (req, res) => {
    const { email, password } = req.body;

    // Strict type and length validation
    if (typeof email !== 'string' || typeof password !== 'string') {
        // If types are wrong, we still want to maintain timing safety if possible,
        // but since we can't even get an email to look up, we just reject.
        // To be perfectly timing-safe we'd need to do a dummy hash here too.
        const DUMMY_HASH = '$2b$12$ROIlwVQgCzLuLoE6wDpqde0hhUzGqMywgkLIrOE5lom6P2F0fhbBO';
        await bcrypt.compare('dummy', DUMMY_HASH);
        return res.status(400).json({ error: 'INVALID_INPUT_TYPE', message: 'Email and password must be strings.' });
    }

    if (email.length > 255 || password.length > 128) {
        const DUMMY_HASH = '$2b$12$ROIlwVQgCzLuLoE6wDpqde0hhUzGqMywgkLIrOE5lom6P2F0fhbBO';
        await bcrypt.compare('dummy', DUMMY_HASH);
        return res.status(400).json({ error: 'INPUT_TOO_LONG' });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const users = await loadUsers();
    const user = users.find(u => String(u.email || '').toLowerCase() === normalizedEmail);

    // Timing-safe login: Always perform a bcrypt.compare to prevent user enumeration via timing attacks.
    // If user not found, compare against a dummy hash to maintain consistent response timing.
    // The dummy hash uses 12 rounds to match the rounds used during user setup.
    const DUMMY_HASH = '$2b$12$ROIlwVQgCzLuLoE6wDpqde0hhUzGqMywgkLIrOE5lom6P2F0fhbBO'; // dummy bcrypt hash (12 rounds)
    const hashToCompare = user ? user.password : DUMMY_HASH;
    const isPasswordValid = await bcrypt.compare(password || '', hashToCompare);

    if (user && isPasswordValid) {
        if (user.totp?.enabled) {
            return beginTwoFactorChallenge(req, res, user);
        }
        establishSession(req, res, user);
    } else {
        res.status(401).json({ error: 'INVALID' });
    }
});

// Second step of sign-in for accounts with two-factor authentication enabled.
router.post('/login/2fa', authRateLimiter, async (req, res) => {
    const pending = req.session?.pendingTwoFactor;
    if (!pending || Date.now() > pending.expiresAt) {
        if (req.session) delete req.session.pendingTwoFactor;
        return res.status(401).json({ error: 'TWO_FACTOR_EXPIRED' });
    }
    const code = req.body?.code;
    if (typeof code !== 'string' || code.length > MAX_CODE_INPUT_LENGTH) {
        return res.status(400).json({ error: 'INVALID_INPUT_TYPE' });
    }
    try {
        const users = await loadUsers();
        const user = findUserById(users, pending.userId);
        if (!user?.totp?.enabled) {
            delete req.session.pendingTwoFactor;
            return res.status(401).json({ error: 'TWO_FACTOR_EXPIRED' });
        }
        const outcome = await attemptSecondFactor(users, user, code);
        if (outcome === 'locked') return res.status(429).json({ error: 'TWO_FACTOR_LOCKED' });
        if (outcome === 'rejected') return res.status(401).json({ error: 'INVALID_TWO_FACTOR_CODE' });
        return establishSession(req, res, user);
    } catch (error) {
        console.error('[AUTH] Two-factor verification failed:', error.message);
        return res.status(500).json({ error: 'TWO_FACTOR_UNAVAILABLE' });
    }
});

// Reports whether the signed-in account has two-factor authentication enabled.
router.get('/2fa', async (req, res) => {
    const userId = req.session?.user?.id;
    if (!userId) return res.status(401).json({ error: 'UNAUTHORIZED' });
    try {
        const users = await loadUsers();
        const user = findUserById(users, userId);
        const enabled = Boolean(user?.totp?.enabled);
        res.json({
            enabled,
            recoveryCodesRemaining: enabled ? (user.totp.recoveryCodeHashes || []).length : 0
        });
    } catch (error) {
        console.error('[AUTH] 2FA status error:', error.message);
        res.status(500).json({ error: 'INTERNAL_ERROR' });
    }
});

// Step 1 of enrollment: confirm the password and issue a pending secret. Nothing is saved to the
// account until the user proves they can produce a code (see /2fa/enable).
router.post('/2fa/setup', authRateLimiter, async (req, res) => {
    const userId = req.session?.user?.id;
    if (!userId) return res.status(401).json({ error: 'UNAUTHORIZED' });
    const { currentPassword } = req.body || {};
    if (typeof currentPassword !== 'string') return res.status(400).json({ error: 'INVALID_INPUT_TYPE' });
    try {
        const users = await loadUsers();
        const user = findUserById(users, userId);
        if (!user || !await bcrypt.compare(currentPassword, user.password)) {
            return res.status(401).json({ error: 'INVALID_CURRENT_PASSWORD' });
        }
        if (user.totp?.enabled) return res.status(409).json({ error: 'TWO_FACTOR_ALREADY_ENABLED' });
        const secret = totp.generateSecret();
        req.session.pendingTotpSetup = { secret, expiresAt: Date.now() + TWO_FACTOR_SETUP_TTL_MS };
        await saveSession(req);
        res.json({ secret, otpauthUri: totp.buildOtpauthUri({ secret, accountName: user.email }) });
    } catch (error) {
        console.error('[AUTH] 2FA setup error:', error.message);
        res.status(500).json({ error: 'INTERNAL_ERROR' });
    }
});

// Step 2 of enrollment: verify a code from the authenticator app, enable 2FA and return
// recovery codes. They are shown once and only their hashes are stored.
router.post('/2fa/enable', authRateLimiter, async (req, res) => {
    const userId = req.session?.user?.id;
    if (!userId) return res.status(401).json({ error: 'UNAUTHORIZED' });
    const pending = req.session.pendingTotpSetup;
    if (!pending || Date.now() > pending.expiresAt) {
        return res.status(400).json({ error: 'TWO_FACTOR_SETUP_EXPIRED' });
    }
    const code = typeof req.body?.code === 'string' ? req.body.code.replace(/\s/g, '') : '';
    const step = totp.verifyTotpCode(pending.secret, code);
    if (step === null) return res.status(401).json({ error: 'INVALID_TWO_FACTOR_CODE' });
    try {
        const users = await loadUsers();
        const user = findUserById(users, userId);
        if (!user) return res.status(401).json({ error: 'UNAUTHORIZED' });
        const recoveryCodes = totp.generateRecoveryCodes();
        const sealedSecret = await totp.sealTotpSecret(pending.secret);
        // Re-check after the await: a concurrent request may have enabled 2FA while the seed was sealed.
        if (user.totp?.enabled) return res.status(409).json({ error: 'TWO_FACTOR_ALREADY_ENABLED' });
        user.totp = {
            enabled: true,
            ...sealedSecret,
            recoveryCodeHashes: recoveryCodes.map((recoveryCode) => totp.hashRecoveryCode(recoveryCode)),
            lastUsedStep: step,
            failedAttempts: 0
        };
        await saveUsers(users);
        delete req.session.pendingTotpSetup;
        await saveSession(req);
        console.log(`[AUTH] Two-factor authentication enabled for user ${user.id}`);
        res.json({ success: true, recoveryCodes });
    } catch (error) {
        console.error('[AUTH] 2FA enable error:', error.message);
        res.status(500).json({ error: 'INTERNAL_ERROR' });
    }
});

// Turns 2FA off. Requires the password and a current code or recovery code.
router.post('/2fa/disable', authRateLimiter, async (req, res) => {
    try {
        const guard = await verifyAccountTwoFactorChange(req, res);
        if (!guard) return;
        delete guard.user.totp;
        await saveUsers(guard.users);
        console.log(`[AUTH] Two-factor authentication disabled for user ${guard.user.id}`);
        res.json({ success: true, enabled: false });
    } catch (error) {
        console.error('[AUTH] 2FA disable error:', error.message);
        res.status(500).json({ error: 'INTERNAL_ERROR' });
    }
});

// Replaces all recovery codes; any previously issued codes stop working immediately.
router.post('/2fa/recovery-codes', authRateLimiter, async (req, res) => {
    try {
        const guard = await verifyAccountTwoFactorChange(req, res);
        if (!guard) return;
        const recoveryCodes = totp.generateRecoveryCodes();
        guard.user.totp.recoveryCodeHashes = recoveryCodes.map((recoveryCode) => totp.hashRecoveryCode(recoveryCode));
        await saveUsers(guard.users);
        res.json({ success: true, recoveryCodes });
    } catch (error) {
        console.error('[AUTH] 2FA recovery code error:', error.message);
        res.status(500).json({ error: 'INTERNAL_ERROR' });
    }
});

// Optional Figranium Cloud SSO handoff. Cloud gives the browser a short-lived,
// single-use opaque code; this instance exchanges it server-to-server and creates
// its normal local session. Self-hosted installations remain unchanged unless both
// Cloud environment variables are configured.
router.get('/cloud-handoff', authRateLimiter, async (req, res) => {
    const exchangeUrl = process.env.FIGRANIUM_CLOUD_AUTH_EXCHANGE_URL;
    const instanceSecret = process.env.FIGRANIUM_CLOUD_INSTANCE_SECRET;
    if (!exchangeUrl || !instanceSecret) return res.status(404).json({ error: 'CLOUD_AUTH_DISABLED' });

    const code = typeof req.query.code === 'string' ? req.query.code : '';
    if (!code || code.length > 512) return res.status(400).json({ error: 'INVALID_HANDOFF_CODE' });

    let url;
    try {
        url = new URL(exchangeUrl);
        if (url.username || url.password) throw new Error('Cloud auth exchange URL must not contain credentials');
        const isTestLoopback = process.env.NODE_ENV === 'test' && ['localhost', '127.0.0.1', '::1'].includes(url.hostname);
        if (url.protocol !== 'https:' && !isTestLoopback) throw new Error('Cloud auth exchange URL must use HTTPS');

        // Production handoffs must exchange only with the Figranium Cloud control
        // plane. This prevents a deployment/configuration mistake from sending the
        // per-instance bearer secret to an arbitrary HTTPS endpoint.
        if (process.env.NODE_ENV !== 'test' && url.hostname !== 'cloud.figranium.dev') {
            throw new Error('Cloud auth exchange URL must use cloud.figranium.dev');
        }
    } catch (error) {
        console.error('[AUTH] Invalid Cloud auth exchange URL:', error.message);
        return res.status(503).json({ error: 'CLOUD_AUTH_MISCONFIGURED' });
    }

    try {
        const exchange = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${instanceSecret}`
            },
            body: JSON.stringify({ code }),
            signal: AbortSignal.timeout(5000),
            redirect: 'error'
        });
        if (!exchange.ok) return res.status(401).json({ error: 'INVALID_HANDOFF_CODE' });

        const contentType = exchange.headers.get('content-type') || '';
        if (!contentType.toLowerCase().includes('application/json')) {
            return res.status(502).json({ error: 'INVALID_CLOUD_RESPONSE' });
        }
        const identity = await exchange.json();
        const email = typeof identity?.email === 'string' ? identity.email.trim().toLowerCase() : '';
        if (!email || email.length > 255 || !/^[^\\s@]+@[^\\s@.]+(?:\\.[^\\s@.]+)+$/.test(email)) {
            return res.status(401).json({ error: 'INVALID_CLOUD_IDENTITY' });
        }

        const users = await loadUsers();
        const user = users.find((candidate) => String(candidate.email || '').toLowerCase() === email);
        if (!user) return res.status(403).json({ error: 'CLOUD_USER_NOT_PROVISIONED' });

        req.session.regenerate(async (err) => {
            if (err) return res.status(500).json({ error: 'SESSION_REGENERATE_FAILED' });
            req.session.user = { id: user.id, name: user.name, email: user.email };
            try {
                await saveSession(req);
                // Never reflect the handoff code into the redirect URL.
                return res.redirect(303, '/');
            } catch (saveErr) {
                console.error('[AUTH] Cloud handoff session save failed:', saveErr);
                return res.status(500).json({ error: 'SESSION_SAVE_FAILED' });
            }
        });
    } catch (error) {
        console.error('[AUTH] Cloud handoff exchange failed:', error.message);
        return res.status(502).json({ error: 'CLOUD_AUTH_UNAVAILABLE' });
    }
});

router.post('/logout', (req, res) => {
    req.session.destroy(() => {
        res.clearCookie('connect.sid');
        res.json({ success: true });
    });
});

router.get('/me', (req, res) => {
    res.json(req.session.user ? { authenticated: true, user: req.session.user } : { authenticated: false });
});

router.patch('/account', authRateLimiter, async (req, res) => {
    const { currentPassword, email, newPassword } = req.body || {};
    if (typeof currentPassword !== 'string' || typeof email !== 'string' || typeof newPassword !== 'string') {
        return res.status(400).json({ error: 'INVALID_INPUT_TYPE' });
    }
    const userId = req.session?.user?.id;
    if (!userId) return res.status(401).json({ error: 'UNAUTHORIZED' });
    const normalizedEmail = email.trim().toLowerCase();
    const changingEmail = normalizedEmail !== String(req.session.user.email || '').toLowerCase();
    const changingPassword = newPassword.length > 0;
    if (!changingEmail && !changingPassword) return res.status(400).json({ error: 'NO_ACCOUNT_CHANGES' });
    if (changingEmail && (normalizedEmail.length > 255 || !/^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/.test(normalizedEmail))) {
        return res.status(400).json({ error: 'INVALID_EMAIL' });
    }
    if (changingPassword && (newPassword.length < 8 || newPassword.length > 128)) {
        return res.status(400).json({ error: newPassword.length < 8 ? 'PASSWORD_TOO_SHORT' : 'PASSWORD_TOO_LONG' });
    }
    const users = await loadUsers();
    const user = users.find((candidate) => String(candidate.id) === String(userId));
    if (!user || !await bcrypt.compare(currentPassword, user.password)) return res.status(401).json({ error: 'INVALID_CURRENT_PASSWORD' });
    if (changingEmail && users.some((candidate) => candidate !== user && String(candidate.email || '').toLowerCase() === normalizedEmail)) {
        return res.status(409).json({ error: 'EMAIL_IN_USE' });
    }
    if (changingEmail) user.email = normalizedEmail;
    if (changingPassword) user.password = await bcrypt.hash(newPassword, 12);
    await saveUsers(users);
    req.session.user = { id: user.id, name: user.name, email: user.email };
    await saveSession(req);
    res.json({ success: true, user: req.session.user });
});

module.exports = router;
