const assert = require('node:assert/strict');
const urls = require('../url-utils');
const original = urls.fetchWithRedirectValidation;
const requests = [];
urls.fetchWithRedirectValidation = async (url, options) => {
    requests.push({ url, options });
    return { ok: true, json: async () => ({ id: 1 }) };
};
const providerPath = require.resolve('../src/server/outputProviders/baserow');
delete require.cache[providerPath];
const baserow = require(providerPath);

(async () => {
    await baserow.push({ config: { baseUrl: 'https://api.baserow.io', token: 'test' } }, { tableId: '42', databaseId: '7', dedicated: true }, { Name: 'Example' });
    assert.equal(requests.length, 1);
    assert.match(requests[0].url, /\/api\/database\/rows\/table\/42\//);
    assert.equal(requests[0].options.method, 'POST');
    await assert.rejects(() => baserow.push({ config: { baseUrl: 'https://api.baserow.io', token: 'test' } }, { tableId: '' }, { Name: 'Example' }), /selected table/);
    console.log('Existing Baserow table output passed');
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => { urls.fetchWithRedirectValidation = original; });
