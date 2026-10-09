const assert = require('node:assert/strict');
const { decryptCache, encryptCache, mapWithConcurrency, saveLoginForDomain } = require('../src/server/onepassword');

(async () => {
    const writes = [];
    const item = { id: 'existing', fields: [
        { id: 'username', title: 'username', fieldType: 'Text', value: 'user@example.com' },
        { id: 'password', title: 'password', fieldType: 'Concealed', value: 'old' }
    ] };
    const dependencies = {
        ensureFigraniumVault: async () => ({ id: 'vault' }),
        client: async () => ({ items: {
            get: async () => item,
            put: async value => writes.push({ type: 'update', value }),
            create: async value => writes.push({ type: 'create', value }),
        } }),
        listLogins: async () => [{ id: 'existing', domains: ['example.com'], username: 'user@example.com' }],
        invalidateLoginCache: async () => {},
    };
    const candidate = { domain: 'example.com', url: 'https://example.com', username: 'user@example.com', password: 'new' };
    assert.equal(await saveLoginForDomain(candidate, dependencies), 'updated');
    assert.equal(item.fields[1].value, 'new');
    assert.equal(writes[0].type, 'update');
    assert.equal(await saveLoginForDomain({ ...candidate, username: 'another@example.com' }, dependencies), 'created');
    assert.equal(writes[1].value.category, 'Login');
    assert.equal(writes[1].value.fields[1].value, 'new');

    const key = require('node:crypto').randomBytes(32);
    const encrypted = encryptCache({ password: 'not-visible' }, key);
    assert.equal(JSON.stringify(encrypted).includes('not-visible'), false);
    assert.deepEqual(decryptCache(encrypted, key), { password: 'not-visible' });
    let active = 0; let maximumActive = 0;
    const mapped = await mapWithConcurrency([1, 2, 3, 4, 5], 2, async value => {
        active += 1; maximumActive = Math.max(maximumActive, active);
        await new Promise(resolve => setTimeout(resolve, 2));
        active -= 1;
        return value * 2;
    });
    assert.deepEqual(mapped, [2, 4, 6, 8, 10]);
    assert.ok(maximumActive <= 2);
    console.log('1Password Login save and update passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
