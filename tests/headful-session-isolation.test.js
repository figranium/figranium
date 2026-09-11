const assert = require('assert');
const EventEmitter = require('events');
const fs = require('fs');
const Module = require('module');
const path = require('path');

const originalRequire = Module.prototype.require;
let persistentLaunches = 0;
let contextOptions = null;

class FakePage extends EventEmitter {
    isClosed() { return false; }
    async goto() { }
}

class FakeContext extends EventEmitter {
    constructor() {
        super();
        this.page = new FakePage();
    }
    pages() { return [this.page]; }
    async addInitScript() { }
    async exposeBinding() { }
    async storageState() { return { cookies: [], origins: [] }; }
    async newCDPSession() { throw new Error('CDP is not needed in this test'); }
    async close() { this.emit('close'); }
}

class FakeBrowser extends EventEmitter {
    async newContext(options) {
        contextOptions = options;
        return new FakeContext();
    }
    async close() { this.emit('disconnected'); }
}

Module.prototype.require = function (request) {
    if (request === './stealth-chromium') {
        return {
            chromium: {
                launch: async () => new FakeBrowser(),
                launchPersistentContext: async () => {
                    persistentLaunches++;
                    throw new Error('Headful mode must not reuse a persistent profile');
                }
            }
        };
    }
    if (request === './proxy-rotation') {
        return { getProxySelection: () => ({ proxy: null }) };
    }
    if (request === './user-agent-settings') {
        return { selectUserAgent: async () => 'Figranium Test Agent' };
    }
    if (request === './url-utils') {
        return { validateUrl: async () => {}, setupNavigationProtection: async () => {} };
    }
    if (request === './src/agent/translate') {
        return { installPageTranslation: async () => {} };
    }
    return originalRequire.apply(this, arguments);
};

(async () => {
    const statePath = path.join(__dirname, '../data/headful-storage-state.json');
    const stateDir = path.dirname(statePath);
    const stateDirExisted = fs.existsSync(stateDir);
    const previousState = fs.existsSync(statePath) ? fs.readFileSync(statePath) : null;

    try {
        fs.mkdirSync(stateDir, { recursive: true });
        fs.writeFileSync(statePath, JSON.stringify({
            cookies: [
                { name: 'valid', value: 'yes', domain: 'example.com', path: '/', expires: -1 },
                { name: 'expired', value: 'no', domain: 'example.com', path: '/', expires: 1 }
            ],
            origins: [{ origin: 'https://example.com', localStorage: [{ name: 'theme', value: 'dark' }] }]
        }));

        const { runHeadful } = require('../headful');
        const response = {
            json() {
                setImmediate(() => require('../headful').getActiveSession().browser.emit('disconnected'));
            }
        };

        await runHeadful({ url: 'https://example.com' }, { res: response });

        assert.strictEqual(persistentLaunches, 0, 'headful sessions should not launch a persistent profile');
        assert.ok(contextOptions, 'headful session should create an isolated browser context');
        assert.deepStrictEqual(contextOptions.storageState.cookies.map(cookie => cookie.name), ['valid']);
        assert.strictEqual(contextOptions.storageState.origins[0].origin, 'https://example.com');
        console.log('Headful session isolation test passed.');
    } finally {
        Module.prototype.require = originalRequire;
        if (previousState) fs.writeFileSync(statePath, previousState);
        else if (fs.existsSync(statePath)) fs.unlinkSync(statePath);
        if (!stateDirExisted) {
            try { fs.rmdirSync(stateDir); } catch { }
        }
    }
})().catch((error) => {
    console.error(error);
    process.exit(1);
});
