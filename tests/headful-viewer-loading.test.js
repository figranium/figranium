const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { websocketCspSources } = require('../src/server/utils');

async function main() {
    assert.equal(websocketCspSources('134.122.126.60'), 'ws://134.122.126.60 wss://134.122.126.60');
    assert.equal(websocketCspSources('localhost:11345'), 'ws://localhost:11345 wss://localhost:11345');
    assert.equal(websocketCspSources('[::1]:11345'), 'ws://[::1]:11345 wss://[::1]:11345');
    for (const host of [undefined, "host; connect-src *", 'user@host', 'host/path', 'host:99999']) {
        assert.equal(websocketCspSources(host), '');
    }

    const html = fs.readFileSync(require.resolve('../public/novnc.html'), 'utf8');
    const script = html.match(/<script type="module">([\s\S]*?)<\/script>/)[1]
        .replace("import('/novnc/core/rfb.js')", 'loadRfb()');
    const run = async (failImport) => {
        const messages = [], requests = [], listeners = {}, rfbListeners = {};
        const status = { textContent: 'Connecting...', classList: { add() {}, remove() {} } };
        let disconnected = false;
        class RFB {
            addEventListener(name, handler) { rfbListeners[name] = handler; }
            disconnect() { disconnected = true; }
        }
        const context = {
            URL, URLSearchParams, AbortController, navigator: {},
            console: { error() {}, info() {} },
            performance: { now: () => 1 },
            setTimeout: () => 1, clearTimeout() {}, setInterval: () => 2, clearInterval() {},
            document: { documentElement: { dataset: {} }, getElementById: id => id === 'status' ? status : {} },
            window: {
                location: { search: '', hostname: '134.122.126.60', port: '', protocol: 'http:', origin: 'http://134.122.126.60' },
                parent: { postMessage: message => messages.push(message) },
                addEventListener: (name, handler) => { listeners[name] = handler; }
            },
            loadRfb: async () => { if (failImport) throw new Error('404'); return { default: RFB }; },
            fetch: async (url) => {
                requests.push(url);
                return { ok: true, json: async () => ({ password: 'test', viewerTicket: 'ticket', adaptiveProfiles: [] }), arrayBuffer: async () => new ArrayBuffer(1024) };
            }
        };
        vm.runInNewContext(script, context);
        await new Promise(resolve => setImmediate(resolve));
        if (failImport) {
            assert.match(status.textContent, /Could not load browser viewer/);
            assert.equal(messages[0].type, 'figranium-headful-viewer-failed');
            assert.equal(requests.length, 0);
        } else {
            assert.ok(rfbListeners.connect, 'viewer initializes after successful module load');
            rfbListeners.connect();
            assert.equal(messages.at(-1).type, 'figranium-headful-viewer-ready');
            listeners.pagehide();
            assert.equal(disconnected, true);
            assert.ok(!requests.some(url => url === '/headful/stop'), 'unloading an old viewer must not stop a new session');
        }
    };
    await run(true);
    await run(false);
    console.log('Headful viewer loading, teardown, and WebSocket CSP tests passed');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
