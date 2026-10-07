const express = require('express');
const bcrypt = require('bcryptjs');
const { loadUsers, saveUsers, saveSession } = require('../storage');
const { authRateLimiter } = require('../middleware');

const router = express.Router();

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
        req.session.regenerate(async (err) => {
            if (err) {
                console.error('[AUTH] Login session regenerate failed:', err);
                return res.status(500).json({ error: 'SESSION_REGENERATE_FAILED' });
            }
            req.session.user = { id: user.id, name: user.name, email: user.email };
            try {
                await saveSession(req);
                res.json({ success: true });
            } catch (saveErr) {
                console.error('[AUTH] Login session save failed:', saveErr);
                return res.status(500).json({ error: 'SESSION_SAVE_FAILED' });
            }
        });
    } else {
        res.status(401).json({ error: 'INVALID' });
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
