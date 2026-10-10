const fs = require('fs');
const assert = require('assert');
const { API_KEY_FILE, API_KEYS_FILE, USERS_FILE } = require('../src/server/constants');

// --- Mock Setup ---
const originalReadFilePromise = fs.promises.readFile;
const originalReadFileSync = fs.readFileSync;
const originalWriteFilePromise = fs.promises.writeFile;
const originalWriteFileSync = fs.writeFileSync;
const originalExistsSync = fs.existsSync;

let mockApiKeyFileContent = JSON.stringify({ apiKey: 'test-secret-key' });
let mockApiKeysFileContent = null;
let mockUsersFileContent = JSON.stringify([]);
let mockFsEnabled = true;

// Mock fs.promises.readFile
fs.promises.readFile = async (filePath, encoding) => {
    if (!mockFsEnabled) return originalReadFilePromise.call(fs.promises, filePath, encoding);

    if (filePath === API_KEY_FILE) {
        if (mockApiKeyFileContent === null) throw new Error('ENOENT');
        return mockApiKeyFileContent;
    }
    if (filePath === API_KEYS_FILE) {
        if (mockApiKeysFileContent === null) throw new Error('ENOENT');
        return mockApiKeysFileContent;
    }
    if (filePath === USERS_FILE) {
        return mockUsersFileContent;
    }
    // Fallback for other files (e.g. node_modules)
    return originalReadFilePromise.call(fs.promises, filePath, encoding);
};

fs.promises.writeFile = async (filePath, content, ...args) => {
    if (filePath === API_KEYS_FILE) {
        mockApiKeysFileContent = content;
        return;
    }
    return originalWriteFilePromise.call(fs.promises, filePath, content, ...args);
};

// Mock fs.readFileSync
fs.readFileSync = (filePath, encoding) => {
    if (!mockFsEnabled) return originalReadFileSync.call(fs, filePath, encoding);
    if (filePath === USERS_FILE) return mockUsersFileContent;
    return originalReadFileSync.call(fs, filePath, encoding);
};

// Mock fs.writeFileSync
fs.writeFileSync = (filePath, content) => {
    if (!mockFsEnabled) return originalWriteFileSync.call(fs, filePath, content);
    if (filePath === API_KEY_FILE) {
        mockApiKeyFileContent = content;
    } else if (filePath === USERS_FILE) {
        mockUsersFileContent = content;
    } else {
        // originalWriteFileSync.call(fs, filePath, content); // Don't write to disk in tests
    }
};

// Mock fs.existsSync
fs.existsSync = (filePath) => {
    if (!mockFsEnabled) return originalExistsSync.call(fs, filePath);
    if (filePath === API_KEY_FILE) return mockApiKeyFileContent !== null;
    if (filePath === USERS_FILE) return true;
    return originalExistsSync.call(fs, filePath);
};


// --- Import Modules Under Test ---
// We import them AFTER mocking fs because they might keep references to fs functions (though usually they call them at runtime)
// Actually storage.js calls fs.promises.readFile, so as long as we replaced the method on the object, we are good.
const { loadApiKey, saveApiKey } = require('../src/server/storage');
const { requireApiKey } = require('../src/server/middleware');

async function runTests() {
    console.log('--- Running API Key Security Tests ---');

    // Test 1: Load API Key from file
    console.log('Test 1: Load API Key from file');
    mockApiKeyFileContent = JSON.stringify({ apiKey: 'key-from-file' });
    let key = await loadApiKey();
    assert.strictEqual(key, 'key-from-file', 'Should load key from file');
    console.log('PASS');

    // Test 2: API Key not present
    console.log('Test 2: API Key not present');
    // Invalidate cache by setting it to undefined via saveApiKey (mocked fs handles write)
    // Actually saveApiKey sets cache to the value passed.
    // If we pass undefined, cache becomes undefined, so next loadApiKey will read from file.
    await saveApiKey(undefined);

    mockApiKeyFileContent = null;
    mockUsersFileContent = JSON.stringify([]);
    key = await loadApiKey();
    assert.strictEqual(key, null, 'Should return null if no key found');
    console.log('PASS');

    // Test 3: Middleware - Valid Key
    console.log('Test 3: Middleware - Valid Key');
    await saveApiKey(undefined); // Clear cache
    mockApiKeyFileContent = JSON.stringify({ apiKey: 'valid-key' });

    let req = {
        get: (header) => {
            if (header === 'x-api-key') return 'valid-key';
            return null;
        },
        body: {},
        ip: '127.0.0.1'
    };
    let res = {
        locals: {},
        status: (code) => {
            res.statusCode = code;
            return res;
        },
        json: (data) => {
            res.body = data;
            return res;
        }
    };
    let nextCalled = false;
    let next = () => { nextCalled = true; };

    await requireApiKey(req, res, next);
    assert.strictEqual(nextCalled, true, 'Next should be called for valid key');
    console.log('PASS');

    // Test 4: Middleware - Invalid Key
    console.log('Test 4: Middleware - Invalid Key');
    req.get = (header) => {
        if (header === 'x-api-key') return 'wrong-key';
        return null;
    };
    nextCalled = false;
    res.statusCode = 200;

    await requireApiKey(req, res, next);
    assert.strictEqual(nextCalled, false, 'Next should NOT be called for invalid key');
    assert.strictEqual(res.statusCode, 401, 'Should return 401');
    console.log('PASS');

    // Test 5: Verify Caching (Performance)
    console.log('Test 5: Caching verification');
    await saveApiKey(undefined); // Clear cache
    mockApiKeyFileContent = JSON.stringify({ apiKey: 'cached-key' });
    let readFileCalls = 0;
    const trackedReadFilePromise = fs.promises.readFile;
    fs.promises.readFile = async (path, enc) => {
        if (path === API_KEY_FILE) readFileCalls++;
        return trackedReadFilePromise(path, enc);
    };

    await loadApiKey();
    await loadApiKey();

    assert.strictEqual(readFileCalls, 1, 'Legacy key should be read only once after cache reset');
    console.log('PASS');

    console.log('--- All Tests Passed ---');
}

runTests().catch(err => {
    console.error('TEST FAILED:', err);
    process.exit(1);
});
