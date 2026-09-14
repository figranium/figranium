const assert = require('assert');
const EventEmitter = require('events');
const Module = require('module');

const originalRequire = Module.prototype.require;
let fakeContext = null;

class FakePage extends EventEmitter {
    constructor(context, name) {
        super();
        this.context = context;
        this.name = name;
        this.evaluateCalls = 0;
        this.evaluateBehaviors = [];
        this.window = {
            inspectEnabled: false,
            __figraniumInspectRevision: 0,
            __figraniumApplyInspectState(state) {
                const revision = Number(state.revision) || 0;
                const appliedRevision = Number(this.__figraniumInspectRevision) || 0;
                if (revision < appliedRevision) return false;
                this.__figraniumInspectRevision = revision;
                this.__figraniumInspectScopeSelector = state.scopeSelector || null;
                this.inspectEnabled = !!state.enabled;
                return true;
            }
        };
    }

    isClosed() { return false; }
    async goto() { }

    execute(fn, arg) {
        for (const [name, callback] of Object.entries(this.context.bindings)) {
            this.window[name] = (...args) => callback({ page: this }, ...args);
        }
        const previousWindow = global.window;
        global.window = this.window;
        return Promise.resolve(fn(arg)).finally(() => {
            global.window = previousWindow;
        });
    }

    evaluate(fn, arg) {
        this.evaluateCalls += 1;
        const behavior = this.evaluateBehaviors.shift();
        return behavior ? behavior(fn, arg) : this.execute(fn, arg);
    }
}

class FakeContext extends EventEmitter {
    constructor() {
        super();
        this.bindings = {};
        this.activePage = new FakePage(this, 'active');
        this.backgroundPage = new FakePage(this, 'background');
    }

    pages() { return [this.activePage, this.backgroundPage]; }
    async addInitScript(script) { this.initScript = script; }
    async exposeBinding(name, callback) { this.bindings[name] = callback; }
    async newCDPSession() { throw new Error('CDP is not needed in this test'); }
    async close() { this.emit('close'); }
}

class FakeBrowser extends EventEmitter {
    async newContext() {
        fakeContext = new FakeContext();
        return fakeContext;
    }
    async close() { this.emit('disconnected'); }
}

Module.prototype.require = function (request) {
    if (request === './stealth-chromium') {
        return { chromium: { launch: async () => new FakeBrowser() } };
    }
    if (request === './proxy-rotation') {
        return { getProxySelection: () => ({ proxy: null }) };
    }
    if (request === './user-agent-settings') {
        return { selectUserAgent: async () => 'Figranium Inspect Test Agent' };
    }
    if (request === './url-utils') {
        return { validateUrl: async () => {}, setupNavigationProtection: async () => {} };
    }
    if (request === './src/agent/translate') {
        return { installPageTranslation: async () => {} };
    }
    return originalRequire.apply(this, arguments);
};

const invokeToggle = (toggleInspectMode, body) => new Promise((resolve, reject) => {
    const response = {
        statusCode: 200,
        status(code) {
            this.statusCode = code;
            return this;
        },
        json(payload) {
            resolve({ status: this.statusCode, body: payload });
        }
    };
    Promise.resolve(toggleInspectMode({ body }, response)).catch(reject);
});

(async () => {
    try {
        const { runHeadful, stopHeadful, toggleInspectMode, getActiveSession } = require('../headful');

        const missingSession = await invokeToggle(toggleInspectMode, { enabled: true });
        assert.strictEqual(missingSession.status, 400);

        let markReady;
        const ready = new Promise(resolve => { markReady = resolve; });
        const runPromise = runHeadful(
            { url: 'https://example.com', statelessExecution: true },
            { res: { json: markReady } }
        );
        await ready;

        const activePage = fakeContext.activePage;
        const backgroundPage = fakeContext.backgroundPage;

        const enabled = await invokeToggle(toggleInspectMode, {
            enabled: true,
            scopeSelector: '  .product-card  '
        });
        assert.strictEqual(enabled.status, 200);
        assert.strictEqual(enabled.body.enabled, true);
        assert.strictEqual(enabled.body.applied, true);
        assert.strictEqual(activePage.window.inspectEnabled, true);
        assert.strictEqual(activePage.window.__figraniumInspectScopeSelector, '.product-card');
        assert.strictEqual(backgroundPage.evaluateCalls, 0, 'background pages must not delay inspect synchronization');

        let releaseFirstEvaluation;
        activePage.evaluateBehaviors.push((fn, arg) => new Promise(resolve => {
            releaseFirstEvaluation = () => resolve(activePage.execute(fn, arg));
        }));
        const firstToggle = invokeToggle(toggleInspectMode, { enabled: true });
        await new Promise(resolve => setImmediate(resolve));
        const secondToggle = await invokeToggle(toggleInspectMode, { enabled: false });
        assert.strictEqual(secondToggle.body.enabled, false);
        assert.strictEqual(activePage.window.inspectEnabled, false);

        releaseFirstEvaluation();
        await firstToggle;
        assert.strictEqual(activePage.window.inspectEnabled, false, 'a delayed enable must apply the latest disabled state');
        assert.strictEqual(getActiveSession().inspectModeEnabled, false);

        activePage.evaluateBehaviors.push(() => Promise.reject(new Error('page is navigating')));
        const deferredFailure = await invokeToggle(toggleInspectMode, { enabled: true });
        assert.strictEqual(deferredFailure.status, 200);
        assert.strictEqual(deferredFailure.body.enabled, true);
        assert.strictEqual(deferredFailure.body.applied, false);

        activePage.evaluateBehaviors.push(() => new Promise(() => {}));
        const timeoutStartedAt = Date.now();
        const timedOut = await invokeToggle(toggleInspectMode, { enabled: false });
        assert.strictEqual(timedOut.status, 200);
        assert.strictEqual(timedOut.body.applied, false);
        assert.ok(Date.now() - timeoutStartedAt < 1500, 'an unresponsive active page must have a bounded response time');

        const navigationState = await fakeContext.bindings.__figraniumGetInspectState({ page: activePage });
        assert.deepStrictEqual(navigationState, {
            enabled: false,
            scopeSelector: null,
            revision: getActiveSession().inspectRevision
        });

        await stopHeadful({}, { json() {} });
        await runPromise;
        console.log('Headful inspect toggle test passed.');
    } finally {
        Module.prototype.require = originalRequire;
    }
})().catch((error) => {
    Module.prototype.require = originalRequire;
    console.error(error);
    process.exit(1);
});
