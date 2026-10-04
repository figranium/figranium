const fs = require('fs');
const path = require('path');
const { THEME_FILE, DEFAULT_THEME_ID, CAPTCHA_SETTINGS_FILE, SYSTEM_SETTINGS_FILE } = require('./constants');

module.exports = function createSettingsStorage({ ensureDB, getPool }) {
// Theme Config Storage
let themeCache = null;
const THEME_PREFERENCE_VERSION = 2;

function migrateThemePreference(payload) {
    const theme = payload && typeof payload.theme === 'string' ? payload.theme : null;
    if (!theme || payload.preferenceVersion === THEME_PREFERENCE_VERSION) {
        return { theme, payload, migrated: false };
    }
    return {
        theme: 'auto',
        payload: { ...payload, theme: 'auto', preferenceVersion: THEME_PREFERENCE_VERSION },
        migrated: true,
    };
}

async function loadThemeConfig() {
    if (themeCache !== null) return themeCache;
    const useDB = await ensureDB();
    if (useDB) {
        try {
            const pool = getPool();
            if (!pool) throw new Error('Database pool not available');
            const res = await pool.query('SELECT data FROM theme_config WHERE id = 1');
            if (res.rows.length > 0 && res.rows[0].data && res.rows[0].data.theme) {
                const migration = migrateThemePreference(res.rows[0].data);
                themeCache = migration.theme;
                if (migration.migrated) {
                    await pool.query('UPDATE theme_config SET data = $1 WHERE id = 1', [migration.payload]);
                }
            } else {
                themeCache = null;
            }
        } catch (e) {
            console.error('[STORAGE] Failed to load theme from DB:', e.message);
            themeCache = null;
        }
        return themeCache;
    }
    try {
        const raw = await fs.promises.readFile(THEME_FILE, 'utf8');
        const parsed = JSON.parse(raw);
        const migration = migrateThemePreference(parsed);
        themeCache = migration.theme;
        if (migration.migrated) {
            await fs.promises.writeFile(THEME_FILE, JSON.stringify(migration.payload, null, 2));
        }
    } catch {
        themeCache = null;
    }
    return themeCache;
}

async function saveThemeConfig(themeId) {
    const validTheme = typeof themeId === 'string' && themeId.trim() ? themeId.trim() : DEFAULT_THEME_ID;
    themeCache = validTheme;
    const payload = { theme: validTheme, preferenceVersion: THEME_PREFERENCE_VERSION };
    const useDB = await ensureDB();
    if (useDB) {
        const pool = getPool();
        try {
            await pool.query('INSERT INTO theme_config (id, data) VALUES (1, $1) ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data', [payload]);
        } catch (e) {
            console.error('[STORAGE] Failed to save theme to DB:', e.message);
        }
        return validTheme;
    }
    try {
        const dir = path.dirname(THEME_FILE);
        if (!fs.existsSync(dir)) {
            await fs.promises.mkdir(dir, { recursive: true });
        }
        await fs.promises.writeFile(THEME_FILE, JSON.stringify(payload, null, 2));
    } catch (e) {
        console.error('[STORAGE] Failed to save theme to file:', e.message);
    }
    return validTheme;
}

// Captcha Solver Settings Storage
let captchaSettingsCache = null;

async function loadCaptchaSettings() {
    if (captchaSettingsCache !== null) return captchaSettingsCache;
    const useDB = await ensureDB();
    if (useDB) {
        try {
            const pool = getPool();
            if (!pool) throw new Error('Database pool not available');
            const res = await pool.query('SELECT data FROM captcha_settings WHERE id = 1');
            captchaSettingsCache = res.rows.length > 0 && res.rows[0].data ? res.rows[0].data : {};
        } catch (e) {
            console.error('[STORAGE] Failed to load captcha settings from DB:', e.message);
            captchaSettingsCache = {};
        }
        return captchaSettingsCache;
    }
    try {
        const raw = await fs.promises.readFile(CAPTCHA_SETTINGS_FILE, 'utf8');
        const parsed = JSON.parse(raw);
        captchaSettingsCache = parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
        captchaSettingsCache = {};
    }
    return captchaSettingsCache;
}

async function saveCaptchaSettings(settings) {
    const baseUrl = settings && typeof settings.baseUrl === 'string' ? settings.baseUrl.trim() : '';
    const clientKey = settings && typeof settings.clientKey === 'string' ? settings.clientKey.trim() : '';
    const payload = { baseUrl, clientKey };
    captchaSettingsCache = payload;
    const useDB = await ensureDB();
    if (useDB) {
        const pool = getPool();
        try {
            await pool.query('INSERT INTO captcha_settings (id, data) VALUES (1, $1) ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data', [payload]);
        } catch (e) {
            console.error('[STORAGE] Failed to save captcha settings to DB:', e.message);
        }
        return payload;
    }
    try {
        const dir = path.dirname(CAPTCHA_SETTINGS_FILE);
        if (!fs.existsSync(dir)) {
            await fs.promises.mkdir(dir, { recursive: true });
        }
        await fs.promises.writeFile(CAPTCHA_SETTINGS_FILE, JSON.stringify(payload, null, 2));
    } catch (e) {
        console.error('[STORAGE] Failed to save captcha settings to file:', e.message);
    }
    return payload;
}

let systemSettingsCache = null;
const DEFAULT_SYSTEM_SETTINGS = { retentionDays: 7 };

async function loadSystemSettings() {
    if (systemSettingsCache) return systemSettingsCache;
    const useDB = await ensureDB();
    if (useDB) {
        try {
            const pool = getPool();
            const res = await pool.query('SELECT data FROM system_settings WHERE id = 1');
            systemSettingsCache = { ...DEFAULT_SYSTEM_SETTINGS, ...(res.rows[0]?.data || {}) };
        } catch (error) {
            console.error('[STORAGE] Failed to load system settings:', error.message);
            systemSettingsCache = { ...DEFAULT_SYSTEM_SETTINGS };
        }
        return systemSettingsCache;
    }
    try {
        const parsed = JSON.parse(await fs.promises.readFile(SYSTEM_SETTINGS_FILE, 'utf8'));
        systemSettingsCache = { ...DEFAULT_SYSTEM_SETTINGS, ...(parsed && typeof parsed === 'object' ? parsed : {}) };
    } catch { systemSettingsCache = { ...DEFAULT_SYSTEM_SETTINGS }; }
    return systemSettingsCache;
}

async function saveSystemSettings(settings) {
    const retentionDays = settings?.retentionDays === null ? null : Number(settings?.retentionDays);
    if (retentionDays !== null && (!Number.isInteger(retentionDays) || retentionDays < 1 || retentionDays > 365)) {
        throw new Error('retentionDays must be null or an integer from 1 to 365');
    }
    const payload = { retentionDays };
    systemSettingsCache = payload;
    const useDB = await ensureDB();
    if (useDB) {
        const pool = getPool();
        await pool.query('INSERT INTO system_settings (id, data) VALUES (1, $1) ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data', [payload]);
        return payload;
    }
    await fs.promises.mkdir(path.dirname(SYSTEM_SETTINGS_FILE), { recursive: true });
    await fs.promises.writeFile(SYSTEM_SETTINGS_FILE, JSON.stringify(payload, null, 2));
    return payload;
}


return {
    loadThemeConfig, saveThemeConfig,
    loadCaptchaSettings, saveCaptchaSettings,
    loadSystemSettings, saveSystemSettings,
};
};
