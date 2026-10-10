const fs = require('fs');
const assert = require('assert');
const { API_KEY_FILE, API_KEYS_FILE } = require('../src/server/constants');
const { loadApiKey, saveApiKey } = require('../src/server/storage');
const { requireApiKey } = require('../src/server/middleware');

// --- Mock FS ---
const originalReadFile = fs.promises.readFile;
const originalWriteFile = fs.promises.writeFile;

let mockApiKeyFileContent = null;

// Mock to simulate legacy file state
fs.promises.readFile = async (filePath) => {
    if (filePath === API_KEYS_FILE) throw new Error('ENOENT');
    if (filePath === API_KEY_FILE) {
        if (mockApiKeyFileContent === null) throw new Error('ENOENT');
        return mockApiKeyFileContent;
    }
    return originalReadFile.call(fs.promises, filePath);
};

// Disable writes during test
fs.promises.writeFile = async () => {};
fs.writeFileSync = () => {};
fs.existsSync = () => true; // Pretend directories exist
fs.promises.stat = async () => ({ mtimeMs: Date.now() });

// Mock ensureDB to force disk usage (though it defaults to disk if DB fails)
const storage = require('../src/server/storage');

async function verifyLegacyCompatibility() {
    console.log('--- Verifying Legacy API Key Compatibility ---');

    // 1. Simulate a legacy API key file (just a JSON string on disk)
    const legacyKey = 'legacy-key-12345';
    mockApiKeyFileContent = JSON.stringify({ apiKey: legacyKey });

    // Clear cache to force reload from "disk"
    await saveApiKey(undefined);

    // 2. Load the key (simulating server startup reading existing file)
    const loadedKey = await loadApiKey();
    assert.strictEqual(loadedKey, legacyKey, 'Should correctly load legacy key from file');
    console.log('✓ Successfully loaded legacy key from storage');

    // 3. Test Authentication with the legacy key using new middleware logic
    let req = {
        get: (header) => {
            if (header === 'x-api-key') return legacyKey;
            return null;
        },
        body: {},
        ip: '127.0.0.1'
    };

    let res = {
        locals: {},
        statusCode: 200,
        status: (code) => { res.statusCode = code; return res; },
        json: (data) => { res.body = data; return res; }
    };

    let nextCalled = false;
    const next = () => { nextCalled = true; };

    await requireApiKey(req, res, next);

    assert.strictEqual(nextCalled, true, 'Middleware should accept the legacy key');
    assert.strictEqual(res.statusCode, 200, 'Status should be 200 (OK)');
    assert.strictEqual(req.apiKey.legacy, true, 'Legacy key should migrate to a scoped verifier');
    console.log('✓ Middleware successfully authenticated legacy key');

    console.log('--- Verification Passed: Legacy keys are compatible ---');
}

verifyLegacyCompatibility().catch(err => {
    console.error('VERIFICATION FAILED:', err);
    process.exit(1);
});
