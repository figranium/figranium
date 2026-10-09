const assert = require('node:assert/strict');

process.env.MASTER_KEY = '00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff';
process.env.MASTER_KEY_FILE = '/proc/figranium/master.key';
const { masterKey } = require('../src/server/secret-store');

masterKey()
    .then(key => {
        assert.equal(key.length, 32);
        console.log('Configured encryption key works without a writable local key file');
    })
    .catch(error => { console.error(error); process.exitCode = 1; });
