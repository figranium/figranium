const assert = require('node:assert/strict');
const fs = require('node:fs');
const net = require('node:net');
const vm = require('node:vm');
const { proxyWebsockify } = require('../src/server/utils');

async function testWebsockifySocketOptimizations() {
    console.log('Testing Websockify socket optimizations (noDelay and keepAlive)...');
    let socketNoDelay = false;
    let socketKeepAlive = false;
    let targetNoDelay = false;
    let targetKeepAlive = false;

    const mockSocket = {
        setNoDelay: (val) => { socketNoDelay = val; },
        setKeepAlive: (val, delay) => { socketKeepAlive = val && delay === 15000; },
        on: () => {},
        destroy: () => {},
        pipe: () => ({ pipe: () => {} })
    };

    const origConnect = net.connect;
    net.connect = (port, host) => {
        const mockTarget = {
            setNoDelay: (val) => { targetNoDelay = val; },
            setKeepAlive: (val, delay) => { targetKeepAlive = val && delay === 15000; },
            on: (event, handler) => {
                if (event === 'connect') setImmediate(handler);
            },
            write: () => {},
            destroy: () => {},
            pipe: () => ({ pipe: () => {} })
        };
        return mockTarget;
    };

    try {
        const handled = proxyWebsockify({ url: '/websockify', method: 'GET', httpVersion: '1.1', rawHeaders: [] }, mockSocket, null);
        assert.equal(handled, true);
        assert.equal(socketNoDelay, true, 'TCP_NODELAY must be set on client socket');
        assert.equal(socketKeepAlive, true, 'Keep-Alive must be enabled on client socket');
        assert.equal(targetNoDelay, true, 'TCP_NODELAY must be set on target socket');
        assert.equal(targetKeepAlive, true, 'Keep-Alive must be enabled on target socket');
    } finally {
        net.connect = origConnect;
    }
    console.log('✓ Websockify socket optimizations verified');
}

async function testNovncHtmlStructureAndOptimizations() {
    console.log('Testing public/novnc.html markup and client-side optimizations...');
    const html = fs.readFileSync(require.resolve('../public/novnc.html'), 'utf8');

    // 1. Module preload and preconnect tags
    assert.match(html, /<link rel="modulepreload" href="\/novnc\/core\/rfb\.js" \/>/);
    assert.match(html, /<link rel="preconnect" href="\/" \/>/);

    // 2. Local typing overlay structure
    assert.match(html, /id="typing-overlay"/);
    assert.match(html, /id="typing-text"/);
    assert.match(html, /class="typing-caret"/);

    // 3. Status and optimizations indicator
    assert.match(html, /id="optimizations-pill"/);

    // 4. Client-side scroll optimization variables and methods
    assert.match(html, /accumulatedScrollY/);
    assert.match(html, /optimisticOffsetY/);
    assert.match(html, /decayOptimisticScroll/);
    assert.match(html, /flushScrollEvents/);

    // 5. Verify script runs cleanly in VM
    const script = html.match(/<script type="module">([\s\S]*?)<\/script>/)[1]
        .replace("import('/novnc/core/rfb.js')", 'loadRfb()');

    const status = { textContent: '', classList: { add() {}, remove() {} } };
    const typingOverlay = { style: {}, classList: { add() {}, remove() {} } };
    const typingText = { textContent: '' };
    const listeners = {};
    const screenListeners = {};

    class MockRFB {
        addEventListener() {}
        disconnect() {}
    }

    const context = {
        URL, URLSearchParams, AbortController, navigator: {},
        console: { error() {}, info() {}, warn() {} },
        performance: { now: () => 1 },
        setTimeout: () => 1, clearTimeout() {}, setInterval: () => 2, clearInterval() {},
        requestAnimationFrame: (cb) => { setImmediate(cb); return 1; },
        cancelAnimationFrame: () => {},
        document: {
            documentElement: { dataset: {} },
            getElementById: (id) => {
                if (id === 'status') return status;
                if (id === 'typing-overlay') return typingOverlay;
                if (id === 'typing-text') return typingText;
                return { style: {}, classList: { add() {}, remove() {} } };
            }
        },
        window: {
            innerWidth: 1920,
            innerHeight: 1080,
            location: { search: '', hostname: '127.0.0.1', port: '11345', protocol: 'http:', origin: 'http://127.0.0.1:11345' },
            parent: { postMessage: () => {} },
            addEventListener: (name, handler) => { listeners[name] = handler; }
        },
        loadRfb: async () => ({ default: MockRFB }),
        fetch: async () => ({
            ok: true,
            json: async () => ({ password: 'test', viewerTicket: 'ticket', adaptiveProfiles: ['full', 'constrained', 'severe'] }),
            arrayBuffer: async () => new ArrayBuffer(512)
        })
    };

    vm.runInNewContext(script, context);
    await new Promise((resolve) => setImmediate(resolve));

    // Simulate keydown event for local typing echo
    assert.ok(listeners.keydown, 'Window keydown listener must be registered for local typing echo');
    listeners.keydown({ key: 'H', length: 1 });
    listeners.keydown({ key: 'i', length: 1 });
    assert.equal(typingText.textContent, 'Hi', 'Typing overlay must locally echo characters with zero lag');

    listeners.keydown({ key: 'Backspace' });
    assert.equal(typingText.textContent, 'H', 'Backspace must update local typing echo buffer immediately');

    listeners.keydown({ key: 'Escape' });
    assert.equal(typingText.textContent, '', 'Escape must clear the local typing echo buffer');

    console.log('✓ novnc.html local typing, scrolling, and connection optimizations verified');
}

async function testCanvasAndModalCookieState() {
    console.log('Testing ExecutionConfigModal and CanvasView Cookie State integration...');
    const executionModalContent = fs.readFileSync(require.resolve('../src/components/editor/ExecutionConfigModal.tsx'), 'utf8');
    assert.match(executionModalContent, /Cookie State/, 'ExecutionConfigModal must have Cookie State label');
    assert.match(executionModalContent, /cookieStateId/, 'ExecutionConfigModal must update cookieStateId');
    assert.match(executionModalContent, /CustomSelect/, 'ExecutionConfigModal must use CustomSelect for cookie states');

    const canvasViewContent = fs.readFileSync(require.resolve('../src/components/editor/CanvasView.tsx'), 'utf8');
    assert.match(canvasViewContent, /role="button"/, 'On Execution card must have role="button"');
    assert.match(canvasViewContent, /cursor-pointer/, 'On Execution card must be cursor-pointer');
    assert.match(canvasViewContent, /Click to configure/, 'On Execution card must have Click to configure indicator');
    assert.match(canvasViewContent, /setIsExecutionConfigOpen\(true\)/, 'On Execution card must open execution config on click');
    assert.match(canvasViewContent, /Cookie state/, 'On Execution card must show Cookie state badge when attached');

    console.log('✓ CanvasView and ExecutionConfigModal verified');
}

async function testHeadfulCookieSavingResilience() {
    console.log('Testing headful cookie state saving resilience...');
    const headfulContent = fs.readFileSync(require.resolve('../headful.js'), 'utf8');

    // 1. Verify saveSessionCookieState is defined and handles fallback
    assert.match(headfulContent, /async function saveSessionCookieState\(session\)/);
    assert.match(headfulContent, /indexedDB: true/);
    assert.match(headfulContent, /indexedDB: false/);
    assert.match(headfulContent, /session\.context\.cookies\(\)/);
    assert.match(headfulContent, /session\.lastKnownStorageState/);

    // 2. Verify lifecycle integration: teardownActiveSession, monitorHeadfulSession, page events, syncInterval
    assert.match(headfulContent, /await saveSessionCookieState\(session\)/);
    assert.match(headfulContent, /trackedPage\.on\('domcontentloaded'/);
    assert.match(headfulContent, /trackedPage\.on\('close'/);

    console.log('✓ Headful cookie state saving resilience verified');
}

async function run() {
    await testWebsockifySocketOptimizations();
    await testNovncHtmlStructureAndOptimizations();
    await testCanvasAndModalCookieState();
    await testHeadfulCookieSavingResilience();
    console.log('\nAll headful optimizations, Cookie State, and cookie persistence tests passed successfully!');
}

run().catch((err) => {
    console.error(err);
    process.exit(1);
});
