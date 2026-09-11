const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {
    SHARED_BROWSER_STATE_PATH,
    loadSharedBrowserState,
    saveSharedBrowserState
} = require('../browser-storage-state');

const stateDir = path.dirname(SHARED_BROWSER_STATE_PATH);
const stateDirExisted = fs.existsSync(stateDir);
const previousState = fs.existsSync(SHARED_BROWSER_STATE_PATH)
    ? fs.readFileSync(SHARED_BROWSER_STATE_PATH)
    : null;

const contextWithState = (state) => ({
    storageState: async () => state
});

(async () => {
    try {
        await saveSharedBrowserState(contextWithState({
            cookies: [{ name: 'headful', value: 'one', domain: 'example.com', path: '/', expires: -1 }],
            origins: [{ origin: 'https://example.com', localStorage: [{ name: 'login', value: 'yes' }] }]
        }));

        await saveSharedBrowserState(contextWithState({
            cookies: [
                { name: 'headful', value: 'one', domain: 'example.com', path: '/', expires: -1 },
                { name: 'headless', value: 'two', domain: 'example.com', path: '/', expires: -1 },
                { name: 'expired', value: 'no', domain: 'example.com', path: '/', expires: 1 }
            ],
            origins: []
        }), { preserveOrigins: true });

        const sharedState = await loadSharedBrowserState();
        assert.deepStrictEqual(sharedState.cookies.map(cookie => cookie.name), ['headful', 'headless']);
        assert.strictEqual(sharedState.origins[0].origin, 'https://example.com');
        console.log('Shared browser state test passed.');
    } finally {
        if (previousState) fs.writeFileSync(SHARED_BROWSER_STATE_PATH, previousState);
        else if (fs.existsSync(SHARED_BROWSER_STATE_PATH)) fs.unlinkSync(SHARED_BROWSER_STATE_PATH);
        if (!stateDirExisted) {
            try { fs.rmdirSync(stateDir); } catch { }
        }
    }
})().catch((error) => {
    console.error(error);
    process.exit(1);
});
