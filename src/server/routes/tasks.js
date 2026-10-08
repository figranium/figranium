const express = require('express');
const { requireAuth, requireApiKey, requireAuthOrApiKey, requireScopedPermission, dataRateLimiter } = require('../middleware');
const {
    loadTasks, saveTasks, getTaskById, getTaskIndexById
} = require('../storage');
const { taskMutex, taskStreams, sendTaskUpdate, sendTaskDeletion } = require('../state');
const { concurrencyGate } = require('../execution-queue');
const { appendTaskVersion, cloneTaskForVersion, removeTaskVersion } = require('../utils');
const { runFigranite } = require('../../agent/figranite/index');
const { clearStopRequest } = require('../../agent/execution-control');

const router = express.Router();

router.get('/', requireAuthOrApiKey, requireScopedPermission('tasks:read'), async (req, res) => {
    const tasks = await loadTasks();
    // ⚡ Bolt: Strip large versions history from the list view to reduce payload size by ~95%
    const allowed = req.apiKey?.taskIds?.length ? tasks.filter(task => req.apiKey.taskIds.includes(String(task.id))) : tasks;
    const summary = allowed.map(({ versions, ...rest }) => rest);
    res.json(summary);
});

router.get('/:id/stream', requireAuth, (req, res) => {
    const taskId = String(req.params.id || '').trim();
    if (!taskId) return res.status(400).json({ error: 'MISSING_TASK_ID' });
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    if (typeof res.flushHeaders === 'function') res.flushHeaders();
    res.write('event: ready\ndata: {}\n\n');

    let clients = taskStreams.get(taskId);
    if (!clients) {
        clients = new Set();
        taskStreams.set(taskId, clients);
    }
    clients.add(res);
    const keepAlive = setInterval(() => {
        try { res.write(':keep-alive\n\n'); } catch { /* ignore */ }
    }, 20000);
    req.on('close', () => {
        clearInterval(keepAlive);
        clients.delete(res);
        if (clients.size === 0) taskStreams.delete(taskId);
    });
});

router.get('/list', requireApiKey, requireScopedPermission('tasks:read'), async (req, res) => {
    const tasks = await loadTasks();
    const summary = tasks.filter(task => !req.apiKey?.taskIds?.length || req.apiKey.taskIds.includes(String(task.id))).map((task) => ({
        id: task.id,
        name: task.name || task.id,
        ...(task.description ? { description: task.description } : {})
    }));
    res.json({ tasks: summary });
});

router.post('/', requireAuthOrApiKey, requireScopedPermission('tasks:manage'), async (req, res) => {
    await taskMutex.lock();
    try {
        const tasks = await loadTasks();
        const newTask = req.body;
        const legacyStatelessExecution = newTask.statelessExecution === true
            || String(newTask.statelessExecution).toLowerCase() === 'true'
            || String(newTask.statelessExecution) === '1';
        delete newTask.statelessExecution;
        if (legacyStatelessExecution) newTask.cookieStateId = null;
        const isExplicitUpdate = req.query.update === 'true';
        if (!newTask.id) newTask.id = 'task_' + Date.now();

        const index = getTaskIndexById(newTask.id);
        if (isExplicitUpdate && index === -1) {
            return res.status(404).json({ error: 'TASK_NOT_FOUND' });
        }
        if (index > -1) {
            const existingTask = tasks[index];
            if (req.query.version === 'true') {
                appendTaskVersion(existingTask);
            }
            // Preserve versions if not creating a new one, as the client might not send them back full
            newTask.versions = existingTask.versions || [];
            // Sticky notes are canvas metadata. Older clients and integrations
            // do not include it in their full-task save payloads, which used to
            // erase notes whenever another task setting was edited.
            if (!Object.prototype.hasOwnProperty.call(newTask, 'stickyNotes')) {
                newTask.stickyNotes = existingTask.stickyNotes;
            }
            tasks[index] = newTask;
        } else {
            if (!Object.prototype.hasOwnProperty.call(newTask, 'cookieStateId')) newTask.cookieStateId = require('../cookie-states').DEFAULT_COOKIE_STATE_ID;
            newTask.versions = [];
            tasks.push(newTask);
        }

        await saveTasks(tasks);
        sendTaskUpdate(newTask);
        res.json(newTask);
    } finally {
        taskMutex.unlock();
    }
});

router.post('/:id/touch', requireAuth, async (req, res) => {
    await taskMutex.lock();
    try {
        const tasks = await loadTasks();
        const task = getTaskById(req.params.id);
        if (!task) return res.status(404).json({ error: 'TASK_NOT_FOUND' });
        task.last_opened = Date.now();
        await saveTasks(tasks);
        res.json(task);
    } finally {
        taskMutex.unlock();
    }
});

/**
 * PATCH /api/tasks/:id
 * Partial update of a task (name, mode, actions, etc.). Creates a version
 * snapshot before modifying. Returns the modified task.
 */
router.patch('/:id', requireAuthOrApiKey, requireScopedPermission('tasks:manage', { taskParam: 'id' }), async (req, res) => {
    await taskMutex.lock();
    try {
        const tasks = await loadTasks();
        const index = getTaskIndexById(req.params.id);
        if (index === -1) return res.status(404).json({ error: 'TASK_NOT_FOUND' });

        const existing = tasks[index];
        const updates = req.body || {};
        if (typeof updates !== 'object' || Array.isArray(updates)) {
            return res.status(400).json({ error: 'INVALID_PAYLOAD' });
        }

        // Snapshot current state into versions before editing
        appendTaskVersion(existing);

        // Shallow-merge allowed top-level fields; never let client overwrite id/versions
        const forbidden = new Set(['id', 'versions']);
        const updated = { ...existing };
        for (const [key, value] of Object.entries(updates)) {
            if (forbidden.has(key)) continue;
            updated[key] = value;
        }
        updated.updatedAt = new Date().toISOString();
        updated.last_opened = Date.now();
        updated.versions = existing.versions || [];

        tasks[index] = updated;
        await saveTasks(tasks);
        sendTaskUpdate(updated);

        res.json({ id: updated.id, updatedAt: updated.updatedAt, status: 'success', task: updated });
    } finally {
        taskMutex.unlock();
    }
});

router.delete('/:id', requireAuthOrApiKey, requireScopedPermission('tasks:manage', { taskParam: 'id' }), async (req, res) => {
    await taskMutex.lock();
    try {
        const taskId = req.params.id;
        let tasks = await loadTasks();
        const before = tasks.length;
        tasks = tasks.filter(t => t.id !== taskId);
        if (tasks.length === before) {
            return res.status(404).json({ error: 'TASK_NOT_FOUND' });
        }
        await saveTasks(tasks);
        sendTaskDeletion(taskId);

        // Clean up any in-process schedule registered for this task
        try {
            const { removeSchedule } = require('../scheduler');
            removeSchedule(taskId);
        } catch (e) {
            // scheduler may not be initialized; safe to ignore
        }

        res.json({ id: taskId, deleted: true, message: 'Task successfully removed.' });
    } finally {
        taskMutex.unlock();
    }
});


router.get('/:id/versions', requireAuth, async (req, res) => {
    await loadTasks();
    const task = getTaskById(req.params.id);
    if (!task) return res.status(404).json({ error: 'TASK_NOT_FOUND' });
    const versions = (task.versions || []).map(v => ({
        id: v.id,
        timestamp: v.timestamp,
        name: v.snapshot?.name || task.name,
        mode: v.snapshot?.mode || task.mode
    }));
    res.json({ versions });
});

router.get('/:id/versions/:versionId', requireAuth, async (req, res) => {
    await loadTasks();
    const task = getTaskById(req.params.id);
    if (!task) return res.status(404).json({ error: 'TASK_NOT_FOUND' });
    const versions = task.versions || [];
    const version = versions.find(v => v.id === req.params.versionId);
    if (!version || !version.snapshot) return res.status(404).json({ error: 'VERSION_NOT_FOUND' });
    res.json({ snapshot: version.snapshot, metadata: { id: version.id, timestamp: version.timestamp } });
});

router.delete('/:id/versions/:versionId', requireAuth, async (req, res) => {
    await taskMutex.lock();
    try {
        const tasks = await loadTasks();
        const index = getTaskIndexById(req.params.id);
        if (index === -1) return res.status(404).json({ error: 'TASK_NOT_FOUND' });
        if (!removeTaskVersion(tasks[index], req.params.versionId)) {
            return res.status(404).json({ error: 'VERSION_NOT_FOUND' });
        }
        await saveTasks(tasks);
        res.json({ success: true, versionId: req.params.versionId });
    } finally {
        taskMutex.unlock();
    }
});

router.post('/:id/versions/clear', requireAuth, async (req, res) => {
    await taskMutex.lock();
    try {
        const tasks = await loadTasks();
        const task = getTaskById(req.params.id);
        if (!task) return res.status(404).json({ error: 'TASK_NOT_FOUND' });
        task.versions = [];
        await saveTasks(tasks);
        res.json({ success: true });
    } finally {
        taskMutex.unlock();
    }
});

router.post('/:id/rollback', requireAuth, async (req, res) => {
    await taskMutex.lock();
    try {
        const { versionId } = req.body || {};
        if (!versionId) return res.status(400).json({ error: 'MISSING_VERSION_ID' });
        const tasks = await loadTasks();
        const index = getTaskIndexById(req.params.id);
        if (index === -1) return res.status(404).json({ error: 'TASK_NOT_FOUND' });

        const task = tasks[index];
        const versions = task.versions || [];
        const version = versions.find(v => v.id === versionId);
        if (!version || !version.snapshot) return res.status(404).json({ error: 'VERSION_NOT_FOUND' });

        appendTaskVersion(task);
        const restored = { ...cloneTaskForVersion(version.snapshot), id: task.id, versions: task.versions };
        // A version created before sticky notes existed must not erase notes
        // added afterwards when it is restored.
        if (!Object.prototype.hasOwnProperty.call(restored, 'stickyNotes')) {
            restored.stickyNotes = task.stickyNotes;
        }
        restored.last_opened = Date.now();

        tasks[index] = restored;

        await saveTasks(tasks);
        sendTaskUpdate(restored);
        res.json(restored);
    } finally {
        taskMutex.unlock();
    }
});

router.post('/test-action', requireAuth, dataRateLimiter, concurrencyGate, async (req, res) => {
    const { taskSnapshot, targetActionId, variables, runId } = req.body || {};
    if (!taskSnapshot || typeof taskSnapshot !== 'object' || !Array.isArray(taskSnapshot.actions)) {
        return res.status(400).json({ error: 'INVALID_TASK_SNAPSHOT' });
    }
    if (!targetActionId || !taskSnapshot.actions.some((action) => String(action.id) === String(targetActionId))) {
        return res.status(400).json({ error: 'INVALID_TARGET_ACTION' });
    }

    const runtimeVariables = variables && typeof variables === 'object' && !Array.isArray(variables)
        ? variables
        : {};
    const testRunId = String(runId || `block_test_${Date.now()}_${Math.floor(Math.random() * 1000)}`);
    const testTask = {
        ...taskSnapshot,
        wait: 0,
        output: undefined,
        extractionScript: undefined,
        extractionFields: undefined,
        extractionGroups: undefined,
        taskVariables: runtimeVariables,
        variables: runtimeVariables,
        runId: testRunId,
        runSource: 'block-test',
        cookieStateId: null,
        disableRecording: true,
    };

    try {
        const result = await runFigranite(testTask, {
            headless: true,
            stopAfterActionId: String(targetActionId),
            testMode: true,
        });
        const testResult = result.testResult || {};
        res.json({
            actionId: String(targetActionId),
            status: testResult.status || 'not_reached',
            durationMs: Number(testResult.durationMs) || 0,
            resolvedInputs: testResult.resolvedInputs || {},
            output: testResult.output,
            errorMessage: testResult.error,
            variables: testResult.variables || {},
            logs: Array.isArray(result.logs) ? result.logs : [],
            screenshotUrl: result.screenshot_url || null,
            timestamp: Date.now(),
        });
    } catch (error) {
        const logs = Array.isArray(error.executionLogs) ? error.executionLogs : [];
        res.status(error.isTaskInputError ? 400 : 500).json({
            error: error.code || 'BLOCK_TEST_FAILED',
            details: error.message,
            logs,
        });
    } finally {
        clearStopRequest(testRunId);
    }
});

module.exports = router;
