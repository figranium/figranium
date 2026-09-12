const DB_FIELDS = ['db_protocol', 'db_username', 'db_password', 'db_host', 'db_port', 'db_database'];

function firstDefined(...values) {
    return values.find((value) => typeof value === 'string' && value.trim() !== '') || '';
}

function hasEnvironmentDatabaseConfig() {
    return Boolean(
        process.env.DB_PROTOCOL ||
        process.env.DB_USERNAME ||
        process.env.DB_PASSWORD ||
        process.env.DB_HOST ||
        process.env.DB_PORT ||
        process.env.DB_DATABASE ||
        process.env.db_protocol ||
        process.env.db_username ||
        process.env.db_password ||
        process.env.db_host ||
        process.env.db_port ||
        process.env.db_database ||
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
        db_protocol: firstDefined(process.env.DB_PROTOCOL, process.env.db_protocol, process.env.DB_TYPE, 'postgres').toLowerCase(),
        db_username: firstDefined(process.env.DB_USERNAME, process.env.db_username, process.env.DB_POSTGRESDB_USER),
        db_password: firstDefined(process.env.DB_PASSWORD, process.env.db_password, process.env.DB_POSTGRESDB_PASSWORD),
        db_host: firstDefined(process.env.DB_HOST, process.env.db_host, process.env.DB_POSTGRESDB_HOST),
        db_port: firstDefined(process.env.DB_PORT, process.env.db_port, process.env.DB_POSTGRESDB_PORT),
        db_database: firstDefined(process.env.DB_DATABASE, process.env.db_database, process.env.DB_POSTGRESDB_DATABASE, 'postgres')
    };
}

async function loadDatabaseConfig() {
    return null;
}

async function saveDatabaseConfig() {
    throw new Error('Database configuration is managed with environment variables.');
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
    saveDatabaseConfig
};
