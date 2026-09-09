const assert = require('assert');
const { maskedDatabaseConfig, validateDatabaseConfig } = require('../src/server/database-config');

const validConfig = {
    db_protocol: 'postgres',
    db_username: 'figranium',
    db_password: 'a-secret-password',
    db_host: 'db.example.test',
    db_port: '5432',
    db_database: 'figranium'
};

assert.deepStrictEqual(validateDatabaseConfig(validConfig), validConfig);
assert.throws(() => validateDatabaseConfig({ ...validConfig, db_protocol: 'mysql' }), /db_protocol/);
assert.throws(() => validateDatabaseConfig({ ...validConfig, db_port: '70000' }), /db_port/);
assert.throws(() => validateDatabaseConfig({ ...validConfig, db_host: 'bad host' }), /db_host/);
assert.throws(() => validateDatabaseConfig({ ...validConfig, db_password: '' }), /db_password/);

const masked = maskedDatabaseConfig(validConfig);
assert.strictEqual(masked.configured, true);
assert.ok(Object.values(masked).every((value) => value !== 'figranium' && value !== 'a-secret-password' && value !== 'db.example.test'));

console.log('Database configuration validation tests passed.');
