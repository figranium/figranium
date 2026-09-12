const assert = require('assert');
const { getEnvironmentDatabaseConfig, hasEnvironmentDatabaseConfig } = require('../src/server/database-config');

const envKeys = [
    'DB_PROTOCOL', 'DB_USERNAME', 'DB_PASSWORD', 'DB_HOST', 'DB_PORT', 'DB_DATABASE', 'DB_SSL',
    'db_protocol', 'db_username', 'db_password', 'db_host', 'db_port', 'db_database', 'db_ssl',
    'DB_TYPE', 'DB_POSTGRESDB_HOST', 'DB_POSTGRESDB_PORT', 'DB_POSTGRESDB_USER',
    'DB_POSTGRESDB_PASSWORD', 'DB_POSTGRESDB_DATABASE', 'DB_POSTGRESDB_SSL'
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
assert.deepStrictEqual(getEnvironmentDatabaseConfig(), {
    db_protocol: 'postgres', db_username: 'figranium', db_password: 'a-secret-password',
    db_host: 'db.example.test', db_port: '5432', db_database: 'figranium'
});

// DigitalOcean App Platform-friendly lowercase names remain fully supported.
clearEnv();
process.env.db_protocol = 'postgres';
process.env.db_username = 'do-user';
process.env.db_password = 'do-password';
process.env.db_host = 'private-db-do-user-123.db.ondigitalocean.com';
process.env.db_port = '25060';
process.env.db_database = 'defaultdb';
process.env.db_ssl = 'true';
assert.strictEqual(hasEnvironmentDatabaseConfig(), true);
assert.deepStrictEqual(getEnvironmentDatabaseConfig(), {
    db_protocol: 'postgres', db_username: 'do-user', db_password: 'do-password',
    db_host: 'private-db-do-user-123.db.ondigitalocean.com', db_port: '25060', db_database: 'defaultdb'
});

// Existing uppercase compatibility names remain supported too.
clearEnv();
process.env.DB_TYPE = 'postgres';
process.env.DB_POSTGRESDB_USER = 'legacy-user';
process.env.DB_POSTGRESDB_PASSWORD = 'legacy-password';
process.env.DB_POSTGRESDB_HOST = 'legacy-db.example.test';
process.env.DB_POSTGRESDB_PORT = '25060';
process.env.DB_POSTGRESDB_DATABASE = 'defaultdb';
assert.deepStrictEqual(getEnvironmentDatabaseConfig(), {
    db_protocol: 'postgres', db_username: 'legacy-user', db_password: 'legacy-password',
    db_host: 'legacy-db.example.test', db_port: '25060', db_database: 'defaultdb'
});

// Canonical uppercase names take precedence, followed by lowercase DO names, then legacy aliases.
process.env.db_username = 'lowercase-user';
process.env.DB_USERNAME = 'canonical-user';
assert.strictEqual(getEnvironmentDatabaseConfig().db_username, 'canonical-user');
delete process.env.DB_USERNAME;
assert.strictEqual(getEnvironmentDatabaseConfig().db_username, 'lowercase-user');

clearEnv();
for (const key of envKeys) {
    if (original[key] !== undefined) process.env[key] = original[key];
}

console.log('Environment database configuration tests passed.');
