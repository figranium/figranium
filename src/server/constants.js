const path = require('path');

const DEFAULT_PORT = 11345;
const DIST_DIR = path.join(__dirname, '../../dist');
const DATA_DIR = path.join(__dirname, '../../data');
const CABINETS_DIR = path.join(DATA_DIR, 'cabinets');
const SESSIONS_DIR = path.join(DATA_DIR, 'sessions');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const ALLOWED_IPS_FILE = path.join(DATA_DIR, 'allowed_ips.json');
const SESSION_SECRET_FILE = path.join(DATA_DIR, 'session_secret.txt');
const TASKS_FILE = path.join(DATA_DIR, 'tasks.json');
const VNC_PASSWORD_FILE = path.join(DATA_DIR, 'vnc_password.txt');
const API_KEY_FILE = path.join(DATA_DIR, 'api_key.json');
const API_KEYS_FILE = path.join(DATA_DIR, 'api_keys.json');
const API_KEY_ARCHIVE_SECRET_FILE = path.join(DATA_DIR, 'api_key_archive_secret.txt');
const COOKIE_STATES_FILE = path.join(DATA_DIR, 'cookie_states.json');
const ONEPASSWORD_FILE = path.join(DATA_DIR, 'onepassword.json');
const PASSWORD_CACHE_FILE = path.join(DATA_DIR, 'password_cache.json');
const PASSWORD_CACHE_KEY_FILE = path.join(DATA_DIR, 'password_cache.key');
const THEME_FILE = path.join(DATA_DIR, 'theme.json');
const DEFAULT_THEME_ID = 'auto';
const CAPTCHA_SETTINGS_FILE = path.join(DATA_DIR, 'captcha_settings.json');
const SYSTEM_SETTINGS_FILE = path.join(DATA_DIR, 'system_settings.json');
const DATABASE_CONFIG_FILE = path.join(DATA_DIR, 'database_config.json');
const STORAGE_STATE_PATH = path.join(__dirname, '../../storage_state.json');
const EXECUTIONS_FILE = path.join(DATA_DIR, 'executions.json');
const EXECUTION_RESULTS_DIR = path.join(DATA_DIR, 'execution-results');
const CREDENTIALS_FILE = path.join(DATA_DIR, 'credentials.json');
const TELEMETRY_STATE_FILE = path.join(DATA_DIR, 'telemetry.json');
const MAX_TASK_VERSIONS = 30;
const MAX_EXECUTIONS = 500;
const REQUEST_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const AUTH_RATE_LIMIT_MAX = Number(process.env.AUTH_RATE_LIMIT_MAX || 10);
const DATA_RATE_LIMIT_MAX = Number(process.env.DATA_RATE_LIMIT_MAX || 100);
const ALLOWED_IPS_TTL_MS = 5000;
const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days
const NOVNC_PORT = Number(process.env.NOVNC_PORT) || 54311;
const NOVNC_LOW_PORT = Number(process.env.NOVNC_LOW_PORT) || 54312;
const WEBSOCKIFY_PATH = '/websockify';
const WEBSOCKIFY_LOW_PATH = '/websockify-low';

const ALLOW_PRIVATE_NETWORKS = ['1', 'true', 'yes'].includes(String(process.env.ALLOW_PRIVATE_NETWORKS || '').toLowerCase());

module.exports = {
    DEFAULT_PORT,
    DIST_DIR,
    DATA_DIR,
    CABINETS_DIR,
    SESSIONS_DIR,
    USERS_FILE,
    ALLOWED_IPS_FILE,
    SESSION_SECRET_FILE,
    TASKS_FILE,
    VNC_PASSWORD_FILE,
    API_KEY_FILE,
    API_KEYS_FILE,
    API_KEY_ARCHIVE_SECRET_FILE,
    COOKIE_STATES_FILE,
    ONEPASSWORD_FILE,
    PASSWORD_CACHE_FILE,
    PASSWORD_CACHE_KEY_FILE,
    THEME_FILE,
    DEFAULT_THEME_ID,
    CAPTCHA_SETTINGS_FILE,
    SYSTEM_SETTINGS_FILE,
    DATABASE_CONFIG_FILE,
    STORAGE_STATE_PATH,
    EXECUTIONS_FILE,
    EXECUTION_RESULTS_DIR,
    CREDENTIALS_FILE,
    TELEMETRY_STATE_FILE,
    MAX_TASK_VERSIONS,
    MAX_EXECUTIONS,
    REQUEST_LIMIT_WINDOW_MS,
    AUTH_RATE_LIMIT_MAX,
    DATA_RATE_LIMIT_MAX,
    ALLOWED_IPS_TTL_MS,
    SESSION_TTL_SECONDS,
    NOVNC_PORT,
    NOVNC_LOW_PORT,
    WEBSOCKIFY_PATH,
    WEBSOCKIFY_LOW_PATH,
    ALLOW_PRIVATE_NETWORKS
};
