const assert = require('node:assert/strict');
const { createRuntimeContext } = require('../src/agent/figranite/run-context');
const { findPasswordLoginForDomain, getPasswordForDomain, getUsernameForDomain, selectFigraniumVault, websiteDomains } = require('../src/server/onepassword');

async function run() {
    const existingFigraniumVault = { id: 'figranium', title: 'Figranium' };
    const staleConfiguredVault = { id: 'old', title: 'Old vault' };
    assert.equal(selectFigraniumVault([staleConfiguredVault, existingFigraniumVault], 'old'), existingFigraniumVault);
    assert.equal(selectFigraniumVault([staleConfiguredVault], 'old'), staleConfiguredVault);
    assert.equal(selectFigraniumVault([], 'old'), null);

    const logins = [
        { id: 'parent', vaultId: 'vault', domains: ['example.com'], hasPassword: true, username: 'parent@example.com' },
        { id: 'subdomain', vaultId: 'vault', domains: ['login.example.com'], hasPassword: true, username: 'subdomain@example.com' },
    ];
    assert.equal(findPasswordLoginForDomain(logins, 'login.example.com').id, 'subdomain');
    assert.throws(
        () => findPasswordLoginForDomain([...logins, { id: 'duplicate', vaultId: 'vault', domains: ['login.example.com'], hasPassword: true }], 'login.example.com'),
        { code: 'AMBIGUOUS_PASSWORD_DOMAIN' }
    );
    assert.throws(
        () => findPasswordLoginForDomain(logins, 'missing.example.com'),
        { code: 'PASSWORD_DOMAIN_NOT_FOUND' }
    );
    assert.deepEqual(websiteDomains({ websites: [{ url: 'https://login.example.com/path' }, { url: 'not a URL' }] }), ['login.example.com']);
    assert.equal(await getPasswordForDomain('example.com', {
        listLogins: async () => logins,
        getPassword: async (_vaultId, itemId) => `password-for-${itemId}`,
    }), 'password-for-parent');
    assert.equal(await getUsernameForDomain('login.example.com', { listLogins: async () => logins }), 'subdomain@example.com');

    const passwordLookups = [];
    const passwords = {
        'example.com': 'example-secret',
        'login.example.com': 'subdomain-secret',
    };
    const usernames = { 'example.com': 'parent@example.com', 'login.example.com': 'subdomain@example.com' };
    const context = await createRuntimeContext({
        url: 'https://example.com',
        taskVariables: { greeting: 'Hello' },
        actions: [{ type: 'type', value: '{$passwords.example^com}' }],
        extractionScript: '"{$passwords.login^example^com}"',
    }, {
        getPasswordForDomain: async domain => {
            passwordLookups.push(domain);
            return passwords[domain];
        },
        getUsernameForDomain: async domain => usernames[domain],
    });

    assert.deepEqual(passwordLookups, ['example.com', 'login.example.com']);
    assert.equal(context.resolveTemplate('{$greeting}: {$passwords.example^com}'), 'Hello: example-secret');
    assert.equal(context.resolveTemplate('{$passwords.login^example^com}'), 'subdomain-secret');
    const taskPassword = await createRuntimeContext({ url: 'https://login.example.com/form', actions: [{ type: 'type', value: '{$password}' }] }, {
        getPasswordForDomain: async domain => passwords[domain],
        getUsernameForDomain: async domain => usernames[domain],
    });
    assert.equal(taskPassword.resolveTemplate('{$password}'), 'subdomain-secret');
    assert.equal(taskPassword.redactSensitive('subdomain-secret'), '[REDACTED]');
    const taskUsername = await createRuntimeContext({ url: 'https://login.example.com/form', actions: [{ type: 'type', value: '{$uname} {$unames.example^com}' }] }, {
        getPasswordForDomain: async domain => passwords[domain],
        getUsernameForDomain: async domain => usernames[domain],
    });
    assert.equal(taskUsername.resolveTemplate('{$uname}'), 'subdomain@example.com');
    assert.equal(taskUsername.resolveTemplate('{$unames.example^com}'), 'parent@example.com');
    assert.equal(taskUsername.redactSensitive('subdomain@example.com'), '[REDACTED]');
    await assert.rejects(() => createRuntimeContext({ url: 'https://example.com', taskVariables: { password: 'plain-text' } }), /password and uname are reserved/);
    await assert.rejects(() => createRuntimeContext({ url: 'https://example.com', taskVariables: { uname: 'plain-text' } }), /password and uname are reserved/);
    assert.deepEqual(context.redactSensitive({
        logs: ['Typing example-secret into #password'],
        testResult: { resolvedInputs: { value: 'subdomain-secret' } },
    }), {
        logs: ['Typing [REDACTED] into #password'],
        testResult: { resolvedInputs: { value: '[REDACTED]' } },
    });

    await assert.rejects(
        () => createRuntimeContext({
            url: 'https://example.com',
            actions: [{ type: 'type', value: '{$passwords.unknown^com}' }],
        }, {
            getPasswordForDomain: async () => {
                const error = new Error('not found');
                error.code = 'PASSWORD_DOMAIN_NOT_FOUND';
                throw error;
            },
        }),
        /No 1Password Login item is mapped to unknown\.com/
    );

    console.log('Password variable resolution passed');
}

run().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
