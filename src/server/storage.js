const fs = require('fs');
const path = require('path');
const {
    USERS_FILE,
    TASKS_FILE,
    EXECUTIONS_FILE,
    EXECUTION_RESULTS_DIR,
    MAX_EXECUTIONS,
} = require('./constants');

const STORAGE_CACHE_TTL = 5000; // 5 seconds
const { initDB, getPool } = require('./db');

let dbInitPromise = null;
let usingDisk = true;

// User Storage
let usersCache = null;
let usersMtime = 0;
let usersLoadPromise = null;
let usersLastCheck = 0;

async function ensureDB() {
    if (dbInitPromise) return dbInitPromise;
    dbInitPromise = (async () => {
        try {
            const pool = await initDB();
            if (pool) usingDisk = false;
        } catch (err) {
            console.error('[STORAGE] Database initialization failed:', err.message);
            console.error('[STORAGE] Falling back to disk storage.');
            usingDisk = true;
        }
        return !usingDisk;
    })();
    return dbInitPromise;
}

async function bulkInsert(client, table, columns, rows) {
    if (!rows || rows.length === 0) return;
    const valuePlaceholders = [];
    const flatValues = [];
    let placeholderIndex = 1;

    for (const row of rows) {
        const placeholders = [];
        for (const col of columns) {
            placeholders.push(`$${placeholderIndex++}`);
            flatValues.push(row[col]);
        }
        valuePlaceholders.push(`(${placeholders.join(', ')})`);
    }

    const query = `INSERT INTO ${table} (${columns.join(', ')}) VALUES ${valuePlaceholders.join(', ')}`;
    await client.query(query, flatValues);
}

// User Storage
// Load users is now asynchronous since DB query is async
async function loadUsers() {
    const useDB = await ensureDB();
    const now = Date.now();
    if (useDB) {
        if (usersCache && (now - usersLastCheck < STORAGE_CACHE_TTL)) {
            return usersCache;
        }
        if (usersLoadPromise) {
            return await usersLoadPromise;
        }
        usersLoadPromise = (async () => {
            try {
                const pool = getPool();
                if (!pool) throw new Error('Database pool not available');
                const res = await pool.query('SELECT data FROM users ORDER BY id ASC');
                usersCache = res.rows.map(r => r.data);
                usersLastCheck = Date.now();
            } catch (e) {
                console.error('[STORAGE] loadUsers DB error:', e.message);
                usersCache = usersCache || [];
            }
            usersLoadPromise = null;
            return usersCache;
        })();
        return await usersLoadPromise;
    }

    if (usersCache && (now - usersLastCheck < STORAGE_CACHE_TTL)) {
        return usersCache;
    }

    let stat;
    try {
        stat = await fs.promises.stat(USERS_FILE);
    } catch {
        usersCache = [];
        usersMtime = 0;
        return [];
    }

    if (usersCache && usersMtime === stat.mtimeMs) {
        usersLastCheck = now;
        return usersCache;
    }

    if (usersLoadPromise) {
        return await usersLoadPromise;
    }

    usersLoadPromise = (async () => {
        try {
            const data = await fs.promises.readFile(USERS_FILE, 'utf8');
            usersCache = JSON.parse(data);
            usersMtime = stat.mtimeMs;
            usersLastCheck = Date.now();
        } catch (e) {
            usersCache = usersCache || [];
            usersMtime = 0;
        }
        usersLoadPromise = null;
        return usersCache;
    })();

    return await usersLoadPromise;
}

async function saveUsers(users) {
    usersCache = users;
    usersLastCheck = Date.now();
    const useDB = await ensureDB();
    if (useDB) {
        const pool = getPool();
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            await client.query('TRUNCATE users');
            const rows = users.map((data, i) => ({ id: i + 1, data }));
            await bulkInsert(client, 'users', ['id', 'data'], rows);
            await client.query('COMMIT');
        } catch (e) {
            await client.query('ROLLBACK');
            throw e;
        } finally {
            client.release();
        }
        return;
    }

    await fs.promises.writeFile(USERS_FILE, JSON.stringify(users, null, 2));
    try {
        const stat = await fs.promises.stat(USERS_FILE);
        usersMtime = stat.mtimeMs;
    } catch {
        // ignore
    }
}

// Task Storage
let tasksCache = null;
let tasksMap = new Map(); // stores { task, index }
let tasksLoadPromise = null;
let tasksMtime = 0;
let tasksLastCheck = 0;

function syncTasksMap() {
    if (!tasksCache) {
        tasksMap.clear();
        return;
    }
    tasksMap = new Map(tasksCache.map((task, index) => [task.id, { task, index }]));
}

function getTaskById(id) {
    if (!tasksCache) return null;
    const entry = tasksMap.get(id);
    return entry ? entry.task : null;
}

function getTaskIndexById(id) {
    if (!tasksCache) return -1;
    const entry = tasksMap.get(id);
    return entry !== undefined ? entry.index : -1;
}

function migrateExtractionScript(script) {
    if (!script || typeof script !== 'string' || !script.includes('$$data')) return script;
    // Replace $$data.html / $$data.url accessed without parens → data.html() / data.url()
    let s = script.replace(/\$\$data\.html(?!\s*\()/g, 'data.html()');
    s = s.replace(/\$\$data\.url(?!\s*\()/g, 'data.url()');
    // Replace any remaining $$data → data
    return s.replace(/\$\$data/g, 'data');
}

function normalizeStickyNoteContent(content) {
    if (typeof content !== 'string') return content;

    let normalized = content.replace(/\r\n?/g, '\n');
    if (normalized.includes('\\n')) normalized = normalized.replace(/\\n/g, '\n');
    if (!normalized.includes('\n') && /(?:^|:\s*)1\.\s+[\s\S]*\s2\.\s+/.test(normalized)) {
        normalized = normalized.replace(/:\s+(?=1\.\s)/, ':\n');
        normalized = normalized.replace(/\s+(?=(?:[2-9]\d*)\.\s)/g, '\n');
    }
    return normalized;
}

function recoverStickyNotesFromVersions(task) {
    // Older clients and integrations can save a full task payload without the
    // stickyNotes field. The previous state is already kept in version history,
    // so restore notes only when the field is absent (never when it is an
    // intentional empty array).
    if (!task || Object.prototype.hasOwnProperty.call(task, 'stickyNotes')) return task;

    const snapshot = (task.versions || [])
        .map(version => version?.snapshot)
        .find(candidate => Array.isArray(candidate?.stickyNotes) && candidate.stickyNotes.length > 0);

    return snapshot ? { ...task, stickyNotes: snapshot.stickyNotes } : task;
}

function migrateTaskScripts(tasks) {
    let changed = false;
    const migrated = tasks.map(task => {
        let nextTask = recoverStickyNotesFromVersions(task);
        if (nextTask !== task) changed = true;

        const newScript = migrateExtractionScript(task.extractionScript);
        if (newScript !== task.extractionScript) {
            changed = true;
            nextTask = { ...nextTask, extractionScript: newScript };
        }

        const notes = nextTask.stickyNotes;
        if (Array.isArray(notes)) {
            const normalizedNotes = notes.map(note => {
                const content = normalizeStickyNoteContent(note.content);
                return content === note.content ? note : { ...note, content };
            });
            if (normalizedNotes.some((note, index) => note !== notes[index])) {
                changed = true;
                nextTask = { ...nextTask, stickyNotes: normalizedNotes };
            }
        }
        return nextTask;
    });
    return { tasks: migrated, changed };
}

async function loadTasks() {
    const useDB = await ensureDB();
    const now = Date.now();
    if (useDB) {
        // Simple cache without mtime check if we rely on in-memory operations to mutate it
        if (tasksCache && (now - tasksLastCheck < STORAGE_CACHE_TTL)) return tasksCache;

        if (tasksLoadPromise) {
            return await tasksLoadPromise;
        }

        tasksLoadPromise = (async () => {
            try {
                const pool = getPool();
                if (!pool) throw new Error('Database pool not available');
                const res = await pool.query('SELECT data FROM tasks');
                const raw = res.rows.map(r => r.data);
                const { tasks: migrated, changed } = migrateTaskScripts(raw);
                tasksCache = migrated;
                tasksLastCheck = Date.now();
                syncTasksMap();
                if (changed) saveTasks(migrated).catch(e => console.error('[MIGRATE] Failed to save migrated tasks:', e));
            } catch (e) {
                console.error('[STORAGE] loadTasks DB error:', e.message);
                tasksCache = tasksCache || [];
                syncTasksMap();
            }
            tasksLoadPromise = null;
            return tasksCache;
        })();

        return await tasksLoadPromise;
    }

    if (tasksCache && (now - tasksLastCheck < STORAGE_CACHE_TTL)) {
        return tasksCache;
    }

    let stat;
    try {
        stat = await fs.promises.stat(TASKS_FILE);
    } catch {
        tasksCache = [];
        tasksMtime = 0;
        return [];
    }

    if (tasksCache && tasksMtime === stat.mtimeMs) {
        tasksLastCheck = now;
        return tasksCache;
    }

    if (tasksLoadPromise) {
        return await tasksLoadPromise;
    }

    tasksLoadPromise = (async () => {
        try {
            const data = await fs.promises.readFile(TASKS_FILE, 'utf8');
            const raw = JSON.parse(data);
            const { tasks: migrated, changed } = migrateTaskScripts(raw);
            tasksCache = migrated;
            tasksMtime = stat.mtimeMs;
            tasksLastCheck = Date.now();
            syncTasksMap();
            if (changed) saveTasks(migrated).catch(e => console.error('[MIGRATE] Failed to save migrated tasks:', e));
        } catch (e) {
            tasksCache = tasksCache || [];
            tasksMtime = 0;
            syncTasksMap();
        }
        tasksLoadPromise = null;
        return tasksCache;
    })();

    return await tasksLoadPromise;
}

async function saveTasks(tasks) {
    tasksCache = tasks;
    tasksLastCheck = Date.now();
    syncTasksMap();
    const useDB = await ensureDB();
    if (useDB) {
        const pool = getPool();
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            await client.query('TRUNCATE tasks');
            const rows = tasks.map(task => ({ id: task.id, data: task }));
            await bulkInsert(client, 'tasks', ['id', 'data'], rows);
            await client.query('COMMIT');
        } catch (e) {
            await client.query('ROLLBACK');
            throw e;
        } finally {
            client.release();
        }
        return;
    }

    await fs.promises.writeFile(TASKS_FILE, JSON.stringify(tasks, null, 2));
    try {
        const stat = await fs.promises.stat(TASKS_FILE);
        tasksMtime = stat.mtimeMs;
    } catch {
        // ignore
    }
}

// Execution Storage
let executionsCache = null;
let executionsMap = new Map();
let executionsLoadPromise = null;
let executionsSaveTimer = null;
let executionsWritePromise = Promise.resolve();
let dbExecutionsCount = null;
const MAX_PERSISTED_EXECUTION_BYTES = Number(process.env.MAX_PERSISTED_EXECUTION_BYTES || 256 * 1024);

const executionResultPath = (id) => path.join(EXECUTION_RESULTS_DIR, `${String(id).replace(/[^a-zA-Z0-9_-]/g, '_')}.json`);

async function saveFullExecutionResult(id, result) {
    if (!id || result === undefined) return;
    const useDB = await ensureDB();
    if (useDB) {
        const pool = getPool();
        await pool.query('INSERT INTO execution_results (execution_id, data) VALUES ($1, $2) ON CONFLICT (execution_id) DO UPDATE SET data = EXCLUDED.data', [id, result]);
        return;
    }
    await fs.promises.mkdir(EXECUTION_RESULTS_DIR, { recursive: true });
    await fs.promises.writeFile(executionResultPath(id), JSON.stringify(result));
}

async function loadFullExecutionResult(id) {
    if (!id) return null;
    const useDB = await ensureDB();
    if (useDB) {
        const pool = getPool();
        const res = await pool.query('SELECT data FROM execution_results WHERE execution_id = $1', [id]);
        return res.rows[0]?.data || null;
    }
    try { return JSON.parse(await fs.promises.readFile(executionResultPath(id), 'utf8')); } catch { return null; }
}

async function deleteFullExecutionResults(ids) {
    const safeIds = [...new Set((Array.isArray(ids) ? ids : [ids]).filter(Boolean).map(String))];
    if (!safeIds.length) return;
    const useDB = await ensureDB();
    if (useDB) {
        const pool = getPool();
        await pool.query('DELETE FROM execution_results WHERE execution_id = ANY($1)', [safeIds]);
        return;
    }
    await Promise.all(safeIds.map((id) => fs.promises.unlink(executionResultPath(id)).catch(() => undefined)));
}

async function boundedExecution(entry) {
    let copy;
    try { copy = JSON.parse(JSON.stringify(entry)); } catch { return { ...entry, result: { truncated: true, reason: 'Result was not serializable' } }; }
    if (Buffer.byteLength(JSON.stringify(copy), 'utf8') <= MAX_PERSISTED_EXECUTION_BYTES) return copy;
    const result = copy.result && typeof copy.result === 'object' ? copy.result : {};
    let hasFullResult = false;
    try {
        await saveFullExecutionResult(copy.id, result);
        hasFullResult = true;
    } catch (error) {
        console.error('[STORAGE] Failed to save full execution result:', error.message);
    }
    // Keep the history entry deliberately small and predictable. The complete
    // payload is available through the on-demand execution result store.
    copy.result = {
        outcome: result.outcome,
        error: typeof result.error === 'string' ? result.error.slice(0, 2048) : result.error,
        url: result.url,
        final_url: result.final_url,
        finalUrl: result.finalUrl,
        screenshot_url: result.screenshot_url,
        screenshotUrl: result.screenshotUrl,
        logs: Array.isArray(result.logs) ? result.logs.slice(0, 20).map((line) => String(line).slice(0, 2048)) : undefined,
        truncated: true,
        hasFullResult
    };
    if (Buffer.byteLength(JSON.stringify(copy), 'utf8') > MAX_PERSISTED_EXECUTION_BYTES) {
        copy.result = { truncated: true, hasFullResult };
    }
    return copy;
}

function syncExecutionsMap() {
    if (!executionsCache) {
        executionsMap.clear();
        return;
    }
    executionsMap = new Map(executionsCache.map(exec => [exec.id, exec]));
}

function getExecutionById(id) {
    if (!executionsCache) return null;
    return executionsMap.get(id) || null;
}

async function performExecutionsWrite(data) {
    const nextWrite = executionsWritePromise.then(() => fs.promises.writeFile(EXECUTIONS_FILE, data));
    executionsWritePromise = nextWrite.catch(() => { });
    return nextWrite;
}

async function loadExecutions() {
    if (executionsCache) return executionsCache;

    if (executionsLoadPromise) {
        return await executionsLoadPromise;
    }

    executionsLoadPromise = (async () => {
        const useDB = await ensureDB();
        if (useDB) {
            try {
                const pool = getPool();
                if (!pool) throw new Error('Database pool not available');
                // order by timestamp descending in postgres JSONB field
                const res = await pool.query("SELECT data FROM executions ORDER BY CAST(data->>'timestamp' AS BIGINT) DESC LIMIT $1", [MAX_EXECUTIONS]);
                executionsCache = res.rows.map(r => r.data);
                // ⚡ Bolt: Initialize dbExecutionsCount if we retrieved the full set
                if (executionsCache.length < MAX_EXECUTIONS) {
                    dbExecutionsCount = executionsCache.length;
                }
            } catch (e) {
                console.error('[STORAGE] loadExecutions DB error:', e.message);
                executionsCache = [];
            }
        } else {
            try {
                const data = await fs.promises.readFile(EXECUTIONS_FILE, 'utf8');
                executionsCache = JSON.parse(data);
            } catch (e) {
                executionsCache = [];
            }
        }
        syncExecutionsMap();
        executionsLoadPromise = null;
        return executionsCache;
    })();

    return await executionsLoadPromise;
}

async function saveExecutions(executions) {
    if (executionsSaveTimer) {
        clearTimeout(executionsSaveTimer);
        executionsSaveTimer = null;
    }
    const removedIds = (executionsCache || []).map((entry) => entry.id).filter((id) => !executions.some((entry) => entry.id === id));
    executionsCache = executions;
    syncExecutionsMap();
    await deleteFullExecutionResults(removedIds);

    const useDB = await ensureDB();
    if (useDB) {
        const pool = getPool();
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            await client.query('TRUNCATE executions');
            const rows = executions.map(exec => ({ id: exec.id, data: exec }));
            await bulkInsert(client, 'executions', ['id', 'data'], rows);
            await client.query('COMMIT');
            // ⚡ Bolt: Keep count in sync after bulk save
            dbExecutionsCount = executions.length;
        } catch (e) {
            await client.query('ROLLBACK');
            throw e;
        } finally {
            client.release();
        }
        return;
    }

    const data = JSON.stringify(executions, null, 2);
    await performExecutionsWrite(data);
}

async function appendExecution(entry) {
    if (!executionsCache) await loadExecutions();

    entry = await boundedExecution(entry);

    executionsCache.unshift(entry);
    // ⚡ Bolt: Incremental Map update instead of rebuilding the entire map (O(1) vs O(N))
    executionsMap.set(entry.id, entry);

    if (executionsCache.length > MAX_EXECUTIONS) {
        const removed = executionsCache.pop();
        if (removed) {
            executionsMap.delete(removed.id);
            await deleteFullExecutionResults(removed.id);
        }
    }

    const useDB = await ensureDB();
    if (useDB) {
        const pool = getPool();
        try {
            await pool.query('INSERT INTO executions (id, data) VALUES ($1, $2)', [entry.id, entry]);

            // ⚡ Bolt: Cold start for executions count tracking
            if (dbExecutionsCount === null) {
                const countRes = await pool.query('SELECT COUNT(*) FROM executions');
                dbExecutionsCount = parseInt(countRes.rows[0].count);
            } else {
                dbExecutionsCount++;
            }

            // Delete oldest if we exceed limit
            if (dbExecutionsCount > MAX_EXECUTIONS) {
                // Find oldest id to delete using timestamp from JSONB
                await pool.query(`
                    DELETE FROM executions 
                    WHERE id IN (
                        SELECT id FROM executions
                        ORDER BY CAST(data->>'timestamp' AS BIGINT) ASC
                        LIMIT 1
                    )
                `);
                dbExecutionsCount--;
            }
        } catch (e) {
            console.error('[STORAGE] Failed to append execution to DB:', e);
        }
        return;
    }

    if (executionsSaveTimer) clearTimeout(executionsSaveTimer);

    executionsSaveTimer = setTimeout(async () => {
        executionsSaveTimer = null;
        try {
            const data = JSON.stringify(executionsCache, null, 2);
            await performExecutionsWrite(data);
        } catch (err) {
            console.error('[STORAGE] Failed to save executions (debounced):', err);
        }
    }, 1000);
}

async function upsertExecution(entry) {
    if (!entry?.id) throw new Error('Execution id is required');
    if (!executionsCache) await loadExecutions();

    entry = await boundedExecution(entry);
    const existingIndex = executionsCache.findIndex((candidate) => candidate.id === entry.id);
    const isNew = existingIndex < 0;
    if (existingIndex >= 0) executionsCache[existingIndex] = entry;
    else executionsCache.unshift(entry);
    executionsMap.set(entry.id, entry);

    if (executionsCache.length > MAX_EXECUTIONS) {
        const removed = executionsCache.pop();
        if (removed) {
            executionsMap.delete(removed.id);
            await deleteFullExecutionResults(removed.id);
        }
    }

    const useDB = await ensureDB();
    if (useDB) {
        const pool = getPool();
        await pool.query(
            'INSERT INTO executions (id, data) VALUES ($1, $2) ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data',
            [entry.id, entry]
        );
        if (isNew) {
            if (dbExecutionsCount === null) {
                const countRes = await pool.query('SELECT COUNT(*) FROM executions');
                dbExecutionsCount = parseInt(countRes.rows[0].count);
            } else {
                dbExecutionsCount++;
            }
            if (dbExecutionsCount > MAX_EXECUTIONS) {
                await pool.query(`
                    DELETE FROM executions
                    WHERE id IN (
                        SELECT id FROM executions
                        ORDER BY CAST(data->>'timestamp' AS BIGINT) ASC
                        LIMIT 1
                    )
                `);
                dbExecutionsCount--;
            }
        }
        return entry;
    }

    if (executionsSaveTimer) clearTimeout(executionsSaveTimer);
    executionsSaveTimer = setTimeout(async () => {
        executionsSaveTimer = null;
        try {
            await performExecutionsWrite(JSON.stringify(executionsCache, null, 2));
        } catch (err) {
            console.error('[STORAGE] Failed to save executions (debounced):', err);
        }
    }, 1000);
    return entry;
}

async function reconcileInFlightExecutions(startupCutoff = Date.now()) {
    const executions = await loadExecutions();
    const now = Date.now();
    let changed = false;
    for (const execution of executions) {
        if (execution.phase !== 'queued' && execution.phase !== 'running') continue;
        if (Number(execution.timestamp) >= startupCutoff) continue;
        changed = true;
        execution.phase = 'finished';
        execution.finishedAt = now;
        execution.durationMs = Math.max(0, now - (execution.startedAt || execution.timestamp || now));
        execution.status = 500;
        execution.outcome = 'crashed';
        execution.result = {
            ...(execution.result && typeof execution.result === 'object' ? execution.result : {}),
            outcome: 'crashed',
            error: 'Server restarted before the execution completed.'
        };
    }
    if (changed) await saveExecutions(executions);
    return changed;
}

const identityStorage = require('./storage-identity')({ ensureDB, getPool, bulkInsert, loadUsers, saveUsers });

// Session Helper
const saveSession = (req) => new Promise((resolve, reject) => {
    if (!req.session) {
        return resolve();
    }
    req.session.save((err) => err ? reject(err) : resolve());
});

const networkStorage = require('./storage-network')();

/**
 * Flush any pending debounced execution writes to disk immediately.
 * Called during graceful shutdown to prevent data loss.
 */
async function flushExecutions() {
    if (executionsSaveTimer) {
        clearTimeout(executionsSaveTimer);
        executionsSaveTimer = null;
    }
    if (!executionsCache) return;

    const useDB = await ensureDB();
    if (useDB) return; // DB writes are immediate, nothing to flush

    try {
        const data = JSON.stringify(executionsCache, null, 2);
        await performExecutionsWrite(data);
    } catch (err) {
        console.error('[STORAGE] Failed to flush executions on shutdown:', err);
    }
}

async function pruneExecutionsBefore(cutoffMs) {
    const cutoff = Number(cutoffMs);
    if (!Number.isFinite(cutoff)) return { deleted: 0, ids: [] };
    const executions = await loadExecutions();
    const expired = executions.filter((entry) => Number(entry?.timestamp) > 0 && Number(entry.timestamp) < cutoff);
    if (!expired.length) return { deleted: 0, ids: [] };
    const expiredIds = expired.map((entry) => entry.id);
    await saveExecutions(executions.filter((entry) => !expiredIds.includes(entry.id)));
    return { deleted: expiredIds.length, ids: expiredIds };
}

const settingsStorage = require('./storage-settings')({ ensureDB, getPool });

module.exports = {
    loadUsers,
    saveUsers,
    loadTasks,
    saveTasks,
    getTaskById,
    getTaskIndexById,
    loadExecutions,
    saveExecutions,
    getExecutionById,
    loadFullExecutionResult,
    deleteFullExecutionResults,
    appendExecution,
    upsertExecution,
    reconcileInFlightExecutions,
    flushExecutions,
    pruneExecutionsBefore,
    loadApiKey: identityStorage.loadApiKey,
    saveApiKey: identityStorage.saveApiKey,
    loadApiKeys: identityStorage.loadApiKeys,
    createApiKey: identityStorage.createApiKey,
    revokeApiKey: identityStorage.revokeApiKey,
    API_KEY_PERMISSIONS: identityStorage.API_KEY_PERMISSIONS,
    importApiKeyMetadata: identityStorage.importApiKeyMetadata,
    importApiKeys: identityStorage.importApiKeys,
    exportApiKeys: identityStorage.exportApiKeys,
    publicApiKeyMetadata: identityStorage.publicApiKeyMetadata,
    loadCredentials: identityStorage.loadCredentials,
    saveCredentials: identityStorage.saveCredentials,
    saveSession,
    loadAllowedIps: networkStorage.loadAllowedIps,
    getStorageStateFile: networkStorage.getStorageStateFile,
    loadThemeConfig: settingsStorage.loadThemeConfig,
    saveThemeConfig: settingsStorage.saveThemeConfig,
    loadCaptchaSettings: settingsStorage.loadCaptchaSettings,
    saveCaptchaSettings: settingsStorage.saveCaptchaSettings,
    loadSystemSettings: settingsStorage.loadSystemSettings,
    saveSystemSettings: settingsStorage.saveSystemSettings
};
