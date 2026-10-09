const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'figranium-key-migration-'));
const legacyKey = crypto.randomBytes(32);
process.env.MASTER_KEY = crypto.randomBytes(32).toString('base64url');
process.env.MASTER_KEY_FILE = path.join(directory, 'master.key');
fs.writeFileSync(process.env.MASTER_KEY_FILE, legacyKey, { mode: 0o600 });

const { seal, readSecretFile } = require('../src/server/secret-store');
const secretFile = path.join(directory, 'onepassword.json');
const payload = { token: 'legacy-token', vaultId: 'vault-id' };
fs.writeFileSync(secretFile, JSON.stringify({
    __figraniumEncrypted: true,
    envelope: seal(payload, legacyKey, 'onepassword-config')
}));

readSecretFile(secretFile, 'onepassword-config', {})
    .then(value => {
        assert.deepEqual(value, payload);
        console.log('Configured master key can read v0.21 local-key encrypted secrets for migration');
    })
    .catch(error => { console.error(error); process.exitCode = 1; })
    .finally(() => { fs.rmSync(directory, { recursive: true, force: true }); });
