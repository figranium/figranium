#!/usr/bin/env node
'use strict';

// Disables two-factor authentication for one account when the user has lost their
// authenticator app and every recovery code. Run it on the host that owns the Figranium
// data directory; access to that host is the trust boundary for this recovery path.
// Stop the server first (or restart it afterwards) so its in-memory user cache cannot
// write the old record back.

const { loadUsers, saveUsers } = require('../src/server/storage');

const email = String(process.argv[2] || '').trim().toLowerCase();

if (!email) {
    console.error('Usage: node scripts/reset-2fa.js <email>');
    process.exit(2);
}

(async () => {
    const users = await loadUsers();
    const user = users.find((candidate) => String(candidate.email || '').toLowerCase() === email);
    if (!user) {
        console.error(`No account found for ${email}.`);
        process.exit(1);
    }
    if (!user.totp) {
        console.log(`Two-factor authentication is not enabled for ${email}. Nothing to do.`);
        process.exit(0);
    }
    delete user.totp;
    await saveUsers(users);
    console.log(`Two-factor authentication disabled for ${email}. Sign in with the password and set it up again.`);
    process.exit(0);
})().catch((error) => {
    console.error('Reset failed:', error.message);
    process.exit(1);
});
