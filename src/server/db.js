const { Pool } = require('pg');
const { getEnvironmentDatabaseConfig } = require('./database-config');

let pool = null;
let initPromise = null;
let initError = null;

async function initDB() {
    if (initPromise) return initPromise;

    initPromise = (async () => {
        const config = getEnvironmentDatabaseConfig();

        const sslEnv = String(process.env.DB_SSL || process.env.db_ssl || process.env.DB_POSTGRESDB_SSL || '').toLowerCase();
        const sslEnabled = sslEnv === 'true' || sslEnv === '1';

        const dbType = config?.db_protocol;
        if (dbType && !['postgres', 'pg'].includes(dbType.toLowerCase())) {
            initError = new Error('Only postgres is supported as a cloud database.');
            throw initError;
        }

        const hasAnyVar = Boolean(config);
        const hasAllVars = config?.db_host && config?.db_port && config?.db_username && config?.db_password;

        if (!hasAnyVar) {
            return null;
        }

        if (!hasAllVars) {
            initError = new Error('PostgreSQL configuration requires host, port, username, and password.');
            throw initError;
        }

        try {
            pool = new Pool({
                host: config.db_host,
                port: parseInt(config.db_port, 10),
                user: config.db_username,
                password: config.db_password,
                database: config.db_database || 'postgres',
                ssl: sslEnabled ? { rejectUnauthorized: false } : false
            });

            const client = await pool.connect();
            try {
                await client.query(`
                    CREATE TABLE IF NOT EXISTS users (
                        id SERIAL PRIMARY KEY,
                        data JSONB NOT NULL
                    );
                `);
                await client.query(`
                    CREATE TABLE IF NOT EXISTS theme_config (
                        id INT PRIMARY KEY DEFAULT 1,
                        data JSONB NOT NULL
                    );
                `);
                await client.query(`
                    CREATE TABLE IF NOT EXISTS tasks (
                        id VARCHAR(255) PRIMARY KEY,
                        data JSONB NOT NULL
                    );
                `);
                await client.query(`
                    CREATE TABLE IF NOT EXISTS executions (
                        id VARCHAR(255) PRIMARY KEY,
                        data JSONB NOT NULL
                    );
                `);
                await client.query(`
                    CREATE TABLE IF NOT EXISTS api_key (
                        id INT PRIMARY KEY DEFAULT 1,
                        key TEXT NOT NULL
                    );
                `);
                await client.query(`
                    CREATE TABLE IF NOT EXISTS gemini_api_key (
                        id SERIAL PRIMARY KEY,
                        key TEXT NOT NULL
                    );
                `);
                await client.query(`
                    CREATE TABLE IF NOT EXISTS openai_api_key (
                        id SERIAL PRIMARY KEY,
                        key TEXT NOT NULL
                    );
                `);
                await client.query(`
                    CREATE TABLE IF NOT EXISTS claude_api_key (
                        id SERIAL PRIMARY KEY,
                        key TEXT NOT NULL
                    );
                `);

                await client.query('ALTER TABLE api_key ALTER COLUMN key TYPE TEXT');
                await client.query('ALTER TABLE gemini_api_key ALTER COLUMN key TYPE TEXT');
                await client.query('ALTER TABLE openai_api_key ALTER COLUMN key TYPE TEXT');
                await client.query('ALTER TABLE claude_api_key ALTER COLUMN key TYPE TEXT');

                await client.query(`
                    CREATE TABLE IF NOT EXISTS ollama_api_key (
                        id SERIAL PRIMARY KEY,
                        key TEXT NOT NULL
                    );
                `);
                await client.query(`
                    CREATE TABLE IF NOT EXISTS credentials (
                        id SERIAL PRIMARY KEY,
                        data JSONB NOT NULL
                    );
                `);
                await client.query(`
                    CREATE TABLE IF NOT EXISTS ai_models (
                        id INT PRIMARY KEY DEFAULT 1,
                        data JSONB NOT NULL
                    );
                `);
                await client.query(`
                    CREATE TABLE IF NOT EXISTS proxies_config (
                        id INT PRIMARY KEY DEFAULT 1,
                        data JSONB NOT NULL
                    );
                `);
                await client.query(`
                    CREATE TABLE IF NOT EXISTS captcha_settings (
                        id INT PRIMARY KEY DEFAULT 1,
                        data JSONB NOT NULL
                    );
                `);
                await client.query(`
                    CREATE TABLE IF NOT EXISTS cabinet_catalog (
                        id INT PRIMARY KEY DEFAULT 1,
                        data JSONB NOT NULL
                    );
                `);
            } finally {
                client.release();
            }

            return pool;
        } catch (err) {
            pool = null;
            initError = err;
            initPromise = null;
            throw err;
        }
    })();

    return initPromise;
}

function getPool() {
    return pool;
}

module.exports = {
    initDB,
    getPool
};
