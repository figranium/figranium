'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
    isNaturalLanguageSelector,
    stripFolatePrefix,
    resolveWithFolate,
    getFolateStatus,
    shutdownFolateWorker
} = require('../src/agent/figranite/folate-client');

test('isNaturalLanguageSelector distinguishes CSS/XPath/coords from descriptions', () => {
    // CSS selectors
    assert.equal(isNaturalLanguageSelector('#submit-btn'), false);
    assert.equal(isNaturalLanguageSelector('.btn.primary'), false);
    assert.equal(isNaturalLanguageSelector('button[type="submit"]'), false);
    assert.equal(isNaturalLanguageSelector('div > ul li a'), false);
    assert.equal(isNaturalLanguageSelector('button'), false);
    assert.equal(isNaturalLanguageSelector('form button'), false);
    assert.equal(isNaturalLanguageSelector('a:has-text("Sign in")'), false);

    // XPath & Playwright engines & coords
    assert.equal(isNaturalLanguageSelector('//button[@id="ok"]'), false);
    assert.equal(isNaturalLanguageSelector('/html/body/div[1]/button'), false);
    assert.equal(isNaturalLanguageSelector('xpath=//button'), false);
    assert.equal(isNaturalLanguageSelector('text=Sign in'), false);
    assert.equal(isNaturalLanguageSelector('data-testid=login-btn'), false);
    assert.equal(isNaturalLanguageSelector('120, 340'), false);

    // Natural language descriptions & explicit prefixes
    assert.equal(isNaturalLanguageSelector('click Search Flights button'), true);
    assert.equal(isNaturalLanguageSelector('Sign in button'), true);
    assert.equal(isNaturalLanguageSelector('the email input field'), true);
    assert.equal(isNaturalLanguageSelector('Login'), true);
    assert.equal(isNaturalLanguageSelector('folate:button'), true);
    assert.equal(isNaturalLanguageSelector('ai:search box'), true);

    // Empty / non-string
    assert.equal(isNaturalLanguageSelector(''), false);
    assert.equal(isNaturalLanguageSelector('   '), false);
    assert.equal(isNaturalLanguageSelector(null), false);
});

test('stripFolatePrefix strips folate: and ai: prefixes cleanly', () => {
    assert.equal(stripFolatePrefix('folate: Sign in button'), 'Sign in button');
    assert.equal(stripFolatePrefix('AI: search box'), 'search box');
    assert.equal(stripFolatePrefix('click Search Flights'), 'click Search Flights');
});

test('resolveWithFolate always uses the local worker and ignores FOLATE_URL', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'folate-test-'));
    const stubWorker = path.join(tmpDir, 'mock-python.js');
    const logFile = path.join(tmpDir, 'requests.json');
    fs.writeFileSync(stubWorker, `#!/usr/bin/env node
const fs = require('node:fs');
const readline = require('node:readline');
const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
rl.on('line', (line) => {
    if (!line.trim()) return;
    const req = JSON.parse(line);
    if (req.action === 'status') {
        process.stdout.write(JSON.stringify({ id: req.id, ok: true, available: true, providers: ['CPUExecutionProvider'] }) + '\\n');
        return;
    }
    fs.writeFileSync(${JSON.stringify(logFile)}, JSON.stringify(req));
    process.stdout.write(JSON.stringify({
        id: req.id,
        ok: true,
        selector: '#search-flights',
        score: 0.96,
        logit: 3.1,
        element: '[TAG] button [ID] search-flights [TEXT] Search Flights',
        matches: [
            { selector: '#search-flights', score: 0.96, logit: 3.1, element: '[TAG] button [ID] search-flights' }
        ]
    }) + '\\n');
});
`, { mode: 0o755 });

    const prevPython = process.env.FOLATE_PYTHON;
    const prevUrl = process.env.FOLATE_URL;
    process.env.FOLATE_PYTHON = stubWorker;
    process.env.FOLATE_URL = 'https://remote.invalid/folate/resolve';
    shutdownFolateWorker();

    try {
        const status = await getFolateStatus();
        assert.equal(status.available, true);
        assert.equal(status.mode, 'local');
        assert.deepEqual(status.providers, ['CPUExecutionProvider']);

        const result = await resolveWithFolate({
            query: 'folate: click Search Flights button',
            html: '<html><body><button id="search-flights">Search Flights</button></body></html>',
            topK: 2
        });

        const received = JSON.parse(fs.readFileSync(logFile, 'utf8'));
        assert.equal(received.action, 'resolve');
        assert.equal(received.query, 'click Search Flights button');
        assert.equal(received.top_k, 2);
        assert.equal(result.selector, '#search-flights');
        assert.equal(result.score, 0.96);
        assert.equal(result.matches.length, 1);
    } finally {
        shutdownFolateWorker();
        if (prevPython === undefined) delete process.env.FOLATE_PYTHON;
        else process.env.FOLATE_PYTHON = prevPython;
        if (prevUrl === undefined) delete process.env.FOLATE_URL;
        else process.env.FOLATE_URL = prevUrl;
        fs.rmSync(tmpDir, { recursive: true, force: true });
    }
});

test('resolveWithFolate validates required query and html', async () => {
    await assert.rejects(() => resolveWithFolate({ query: '', html: '<html/>' }), /FOLATE_QUERY_REQUIRED/);
    await assert.rejects(() => resolveWithFolate({ query: 'login', html: '' }), /FOLATE_HTML_REQUIRED/);
});
