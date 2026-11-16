'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

const {
    isNaturalLanguageSelector,
    stripFolatePrefix,
    resolveWithFolate,
    getFolateStatus
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

test('resolveWithFolate calls remote FOLATE_URL endpoint and returns top match', async () => {
    let receivedBody = null;
    let receivedAuth = null;
    const server = http.createServer((req, res) => {
        receivedAuth = req.headers.authorization;
        let raw = '';
        req.on('data', (chunk) => { raw += chunk; });
        req.on('end', () => {
            receivedBody = JSON.parse(raw);
            res.writeHead(200, { 'content-type': 'application/json' });
            res.end(JSON.stringify({
                selector: '#search-flights',
                score: 0.96,
                element: '[TAG] button [ID] search-flights [TEXT] Search Flights',
                matches: [
                    { selector: '#search-flights', score: 0.96, element: '[TAG] button [ID] search-flights' }
                ]
            }));
        });
    });

    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const port = server.address().port;
    const prevUrl = process.env.FOLATE_URL;
    const prevToken = process.env.FOLATE_TOKEN;
    process.env.FOLATE_URL = `http://127.0.0.1:${port}/folate/resolve`;
    process.env.FOLATE_TOKEN = 'test-secret';

    try {
        const status = await getFolateStatus();
        assert.equal(status.available, true);
        assert.equal(status.mode, 'remote');

        const result = await resolveWithFolate({
            query: 'folate: click Search Flights button',
            html: '<html><body><button id="search-flights">Search Flights</button></body></html>',
            topK: 2
        });

        assert.equal(receivedAuth, 'Bearer test-secret');
        assert.equal(receivedBody.query, 'click Search Flights button');
        assert.equal(receivedBody.topK, 2);
        assert.equal(result.selector, '#search-flights');
        assert.equal(result.score, 0.96);
        assert.equal(result.matches.length, 1);
    } finally {
        if (prevUrl === undefined) delete process.env.FOLATE_URL;
        else process.env.FOLATE_URL = prevUrl;
        if (prevToken === undefined) delete process.env.FOLATE_TOKEN;
        else process.env.FOLATE_TOKEN = prevToken;
        server.close();
    }
});

test('resolveWithFolate validates required query and html', async () => {
    await assert.rejects(() => resolveWithFolate({ query: '', html: '<html/>' }), /FOLATE_QUERY_REQUIRED/);
    await assert.rejects(() => resolveWithFolate({ query: 'login', html: '' }), /FOLATE_HTML_REQUIRED/);
});
