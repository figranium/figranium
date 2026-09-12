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
        db_protocol: firstDefined(process.env.DB_PROTOCOL, process.env.DB_TYPE, 'postgres').toLowerCase(),
        db_username: firstDefined(process.env.DB_USERNAME, process.env.DB_POSTGRESDB_USER),
        db_password: firstDefined(process.env.DB_PASSWORD, process.env.DB_POSTGRESDB_PASSWORD),
        db_host: firstDefined(process.env.DB_HOST, process.env.DB_POSTGRESDB_HOST),
        db_port: firstDefined(process.env.DB_PORT, process.env.DB_POSTGRESDB_PORT),
        db_database: firstDefined(process.env.DB_DATABASE, process.env.DB_POSTGRESDB_DATABASE, 'postgres')
    };
}

module.exports = {
    getEnvironmentDatabaseConfig,
    hasEnvironmentDatabaseConfig
};
