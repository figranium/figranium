const assert = require('assert');
const { getEnvironmentDatabaseConfig, hasEnvironmentDatabaseConfig } = require('../src/server/database-config');

const envKeys = [
    'DB_PROTOCOL',
    'DB_USERNAME',
    'DB_PASSWORD',
    'DB_HOST',
    'DB_PORT',
    'DB_DATABASE',
    'DB_SSL',
    'DB_TYPE',
    'DB_POSTGRESDB_HOST',
    'DB_POSTGRESDB_PORT',
    'DB_POSTGRESDB_USER',
    'DB_POSTGRESDB_PASSWORD',
    'DB_POSTGRESDB_DATABASE',
    'DB_POSTGRESDB_SSL'
];

const original = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));
const clearEnv = () => {
    for (const key of envKeys) delete process.env[key];
};

clearEnv();

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

// DigitalOcean-friendly names remain fully supported for existing deployments.
clearEnv();
process.env.DB_TYPE = 'postgres';
process.env.DB_POSTGRESDB_USER = 'do-user';
process.env.DB_POSTGRESDB_PASSWORD = 'do-password';
process.env.DB_POSTGRESDB_HOST = 'private-db-do-user-123.db.ondigitalocean.com';
process.env.DB_POSTGRESDB_PORT = '25060';
process.env.DB_POSTGRESDB_DATABASE = 'defaultdb';
process.env.DB_POSTGRESDB_SSL = 'true';

assert.strictEqual(hasEnvironmentDatabaseConfig(), true);
assert.deepStrictEqual(getEnvironmentDatabaseConfig(), {
    db_protocol: 'postgres',
    db_username: 'do-user',
    db_password: 'do-password',
    db_host: 'private-db-do-user-123.db.ondigitalocean.com',
    db_port: '25060',
    db_database: 'defaultdb'
});

// Short names take precedence when both naming schemes are present.
process.env.DB_PROTOCOL = 'pg';
process.env.DB_USERNAME = 'short-user';
process.env.DB_PASSWORD = 'short-password';
process.env.DB_HOST = 'short-db.example.test';
process.env.DB_PORT = '5433';
process.env.DB_DATABASE = 'shortdb';

assert.deepStrictEqual(getEnvironmentDatabaseConfig(), {
    db_protocol: 'pg',
    db_username: 'short-user',
    db_password: 'short-password',
    db_host: 'short-db.example.test',
    db_port: '5433',
    db_database: 'shortdb'
});

clearEnv();
for (const key of envKeys) {
    if (original[key] !== undefined) process.env[key] = original[key];
}

console.log('Environment database configuration tests passed.');
