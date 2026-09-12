const assert = require('assert');
const { getEnvironmentDatabaseConfig, hasEnvironmentDatabaseConfig } = require('../src/server/database-config');

const envKeys = [
    'DB_PROTOCOL',
    'DB_USERNAME',
    'DB_PASSWORD',
    'DB_HOST',
    'DB_PORT',
    'DB_DATABASE',
    'DB_TYPE',
    'DB_POSTGRESDB_HOST',
    'DB_POSTGRESDB_PORT',
    'DB_POSTGRESDB_USER',
    'DB_POSTGRESDB_PASSWORD',
    'DB_POSTGRESDB_DATABASE'
];

const original = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));
for (const key of envKeys) delete process.env[key];

assert.strictEqual(hasEnvironmentDatabaseConfig(), false);
assert.strictEqual(getEnvironmentDatabaseConfig(), null);

process.env.DB_PROTOCOL = 'postgres';
process.env.DB_USERNAME = 'figranium';
process.env.DB_PASSWORD = 'a-secret-password';
process.env.DB_HOST = 'db.example.test';
process.env.DB_PORT = '5432';
process.env.DB_DATABASE = 'figranium';

assert.strictEqual(hasEnvironmentDatabaseConfig(), true);
assert.deepStrictEqual(getEnvironmentDatabaseConfig(), {
    db_protocol: 'postgres',
    db_username: 'figranium',
    db_password: 'a-secret-password',
    db_host: 'db.example.test',
    db_port: '5432',
    db_database: 'figranium'
});

for (const key of envKeys) {
    if (original[key] === undefined) delete process.env[key];
    else process.env[key] = original[key];
}

console.log('Environment database configuration tests passed.');
