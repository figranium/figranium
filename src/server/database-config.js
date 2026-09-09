const fs = require('fs');
const path = require('path');
const { DATABASE_CONFIG_FILE } = require('./constants');

const DB_FIELDS = ['db_protocol', 'db_username', 'db_password', 'db_host', 'db_port', 'db_database'];

function readField(value, name, { required = true, maxLength = 255 } = {}) {
    if (typeof value !== 'string') {
        if (required) throw new Error(`${name} is required.`);
        return '';
    }
    const trimmed = value.trim();
    if (required && !trimmed) throw new Error(`${name} is required.`);
    if (trimmed.length > maxLength || /[\u0000-\u001f\u007f]/.test(trimmed)) throw new Error(`${name} is invalid.`);
    return trimmed;
}

function validateDatabaseConfig(config) {
    const db_protocol = readField(config.db_protocol, 'db_protocol', { maxLength: 16 }).toLowerCase();
    if (!['postgres', 'pg'].includes(db_protocol)) throw new Error('db_protocol must be postgres or pg.');

    const db_host = readField(config.db_host, 'db_host');
    if (/\s/.test(db_host)) throw new Error('db_host is invalid.');

    const db_port = readField(config.db_port, 'db_port', { maxLength: 5 });
    const port = Number(db_port);
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('db_port must be between 1 and 65535.');

    return {
        db_protocol,
        db_username: readField(config.db_username, 'db_username'),
        db_password: readField(config.db_password, 'db_password', { maxLength: 1024 }),
        db_host,
        db_port: String(port),
        db_database: readField(config.db_database, 'db_database')
    };
}

async function loadDatabaseConfig() {
    try {
        const raw = await fs.promises.readFile(DATABASE_CONFIG_FILE, 'utf8');
        const config = JSON.parse(raw);
        return validateDatabaseConfig(config);
    } catch (error) {
        if (error.code === 'ENOENT') return null;
        console.error('[DATABASE_CONFIG] Failed to read saved configuration:', error.message);
        return null;
    }
}

async function saveDatabaseConfig(config) {
    const validConfig = validateDatabaseConfig(config);
    await fs.promises.mkdir(path.dirname(DATABASE_CONFIG_FILE), { recursive: true });
    await fs.promises.writeFile(DATABASE_CONFIG_FILE, JSON.stringify(validConfig, null, 2), { mode: 0o600 });
    await fs.promises.chmod(DATABASE_CONFIG_FILE, 0o600).catch(() => {});
    return validConfig;
}

function hasEnvironmentDatabaseConfig() {
    return Boolean(
        process.env.DB_TYPE ||
        process.env.DB_POSTGRESDB_HOST ||
        process.env.DB_POSTGRESDB_PORT ||
        process.env.DB_POSTGRESDB_USER ||
        process.env.DB_POSTGRESDB_PASSWORD ||
        process.env.DB_POSTGRESDB_DATABASE
    );
}

function getEnvironmentDatabaseConfig() {
    if (!hasEnvironmentDatabaseConfig()) return null;
    return {
        db_protocol: process.env.DB_TYPE || 'postgres',
        db_username: process.env.DB_POSTGRESDB_USER || '',
        db_password: process.env.DB_POSTGRESDB_PASSWORD || '',
        db_host: process.env.DB_POSTGRESDB_HOST || '',
        db_port: process.env.DB_POSTGRESDB_PORT || '',
        db_database: process.env.DB_POSTGRESDB_DATABASE || 'postgres'
    };
}

function maskedDatabaseConfig(config) {
    return {
        configured: Boolean(config),
        db_protocol: config?.db_protocol ? '••••••••' : '',
        db_username: config?.db_username ? '••••••••' : '',
        db_password: config?.db_password ? '••••••••' : '',
        db_host: config?.db_host ? '••••••••' : '',
        db_port: config?.db_port ? '••••••••' : '',
        db_database: config?.db_database ? '••••••••' : ''
    };
}

module.exports = {
    DB_FIELDS,
    getEnvironmentDatabaseConfig,
    hasEnvironmentDatabaseConfig,
    loadDatabaseConfig,
    maskedDatabaseConfig,
    saveDatabaseConfig,
    validateDatabaseConfig
};
