const assert = require('assert');
const http = require('http');
const { chromium } = require('playwright');
const { executeAction } = require('../src/agent/figranite/action-handler');
const { buildResolvedActionInputs } = require('../src/agent/figranite/index');

let pageLoads = 0;
const server = http.createServer((_req, res) => {
    pageLoads += 1;
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(`<!doctype html>
        <input id="box" type="checkbox">
        <button id="single">Single</button>
        <button id="double">Double</button>
        <button id="right">Right</button>
        <div id="source" draggable="true">Drag me</div>
        <div id="target">Drop here</div>
        <output id="loads">${pageLoads}</output>
        <script>
          window.events = { single: 0, double: 0, right: 0, dropped: false };
          single.onclick = () => window.events.single++;
          double.ondblclick = () => window.events.double++;
          right.oncontextmenu = (event) => { event.preventDefault(); window.events.right++; };
          target.ondragover = (event) => event.preventDefault();
          target.ondrop = (event) => { event.preventDefault(); window.events.dropped = true; };
        </script>`);
});

const actionContext = (page) => ({
    page,
    logs: [],
    runtimeVars: {},
    resolveTemplate: (value) => String(value).replace('{$source}', '#source').replace('{$target}', '#target'),
    captureScreenshot: async () => null,
    baseDelay: () => 0,
    options: {},
    pendingDownloads: new Set(),
    successfulUploads: new Map()
});

async function runTest() {
    let browser;
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address();
    try {
        browser = await chromium.launch({ headless: true });
        const page = await (await browser.newContext()).newPage();
        await page.goto(`http://127.0.0.1:${port}`);
        const context = actionContext(page);

        await executeAction({ type: 'click', selector: '#single' }, context);
        await executeAction({ type: 'click', selector: '#double', clickType: 'double' }, context);
        await executeAction({ type: 'click', selector: '#right', clickType: 'right' }, context);
        assert.deepStrictEqual(await page.evaluate(() => window.events), { single: 1, double: 1, right: 1, dropped: false });

        await executeAction({ type: 'check', selector: '#box' }, context);
        await executeAction({ type: 'check', selector: '#box' }, context);
        assert.strictEqual(await page.isChecked('#box'), true);
        await executeAction({ type: 'uncheck', selector: '#box' }, context);
        await executeAction({ type: 'uncheck', selector: '#box' }, context);
        assert.strictEqual(await page.isChecked('#box'), false);

        await executeAction({ type: 'drag_and_drop', selector: '{$source}', targetSelector: '{$target}' }, context);
        assert.strictEqual(await page.evaluate(() => window.events.dropped), true);

        const beforeReload = await page.textContent('#loads');
        await executeAction({ type: 'reload' }, context);
        assert.notStrictEqual(await page.textContent('#loads'), beforeReload);

        assert.deepStrictEqual(
            buildResolvedActionInputs({ clickType: 'double', targetSelector: '{$target}' }, context.resolveTemplate),
            { clickType: 'double', targetSelector: '#target' }
        );

        console.log('Richer interaction actions passed.');
    } finally {
        if (browser) await browser.close();
        await new Promise((resolve) => server.close(resolve));
    }
}

runTest().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
