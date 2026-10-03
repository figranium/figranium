/**
 * Execution concurrency limiter.
 * When MAX_CONCURRENT_EXECUTIONS is set, queues excess requests.
 * When unset, all requests pass through immediately (backward compatible).
 */

const { resourceMonitor } = require('./resource-monitor');

const MAX_QUEUE = Number(process.env.MAX_EXECUTION_QUEUE || 50);
const QUEUE_TIMEOUT_MS = Number(process.env.EXECUTION_QUEUE_TIMEOUT_MS || 10 * 60 * 1000);

let activeCount = 0;
const waitQueue = [];

/**
 * Acquire a slot. Resource pressure pauses the FIFO rather than allowing a
 * burst of Chromium processes to exhaust a small host.
 * Returns a release function that MUST be called when execution completes.
 */
function acquire(options = {}) {
    resourceMonitor.start();
    const status = resourceMonitor.status();
    if (!resourceMonitor.isPressured() && activeCount < status.maxConcurrent) {
        activeCount++;
        return Promise.resolve(release);
    }

    if (waitQueue.length >= MAX_QUEUE) {
        return Promise.reject(Object.assign(new Error('Execution queue is full'), { code: 'RESOURCE_CAPACITY_EXCEEDED' }));
    }
    return new Promise((resolve, reject) => {
        const item = { resolve, reject, timer: null, runId: options.runId || null };
        item.timer = setTimeout(() => {
            const index = waitQueue.indexOf(item);
            if (index >= 0) waitQueue.splice(index, 1);
            reject(Object.assign(new Error('Execution queue wait timed out'), { code: 'RESOURCE_CAPACITY_EXCEEDED' }));
        }, QUEUE_TIMEOUT_MS);
        waitQueue.push(item);
    });
}

function cancelQueuedExecution(runId) {
    if (!runId) return false;
    const index = waitQueue.findIndex((item) => item.runId === runId);
    if (index < 0) return false;
    const [item] = waitQueue.splice(index, 1);
    clearTimeout(item.timer);
    item.reject(Object.assign(new Error('Execution stopped while queued'), { code: 'EXECUTION_STOPPED' }));
    return true;
}

function release() {
    activeCount = Math.max(0, activeCount - 1);
    drain();
}

function drain() {
    resourceMonitor.probe();
    const status = resourceMonitor.status();
    if (resourceMonitor.isPressured(status)) return;
    while (waitQueue.length > 0 && activeCount < status.maxConcurrent) {
        const next = waitQueue.shift();
        clearTimeout(next.timer);
        activeCount++;
        next.resolve(release);
    }
}

// Resource probes can be initiated by drain itself. Defer event-driven draining
// to avoid recursive probes while a release is handing a slot to the next job.
resourceMonitor.on('change', () => setImmediate(drain));

/**
 * Express middleware that gates execution behind the concurrency limiter.
 * If MAX_CONCURRENT_EXECUTIONS is not set, passes through immediately.
 */
function concurrencyGate(req, res, next) {
    const runId = String(req.body?.runId || res.locals?.executionId || '').trim() || null;
    const cancelIfQueued = () => cancelQueuedExecution(runId);
    res.once('close', cancelIfQueued);
    acquire({ runId }).then(async (releaseFn) => {
        res.removeListener('close', cancelIfQueued);
        let released = false;
        const safeRelease = () => {
            if (!released) {
                released = true;
                releaseFn();
            }
        };
        res.locals._releaseExecution = safeRelease;
        res.once('finish', safeRelease);
        res.once('close', safeRelease);

        if (typeof res.locals.markExecutionRunning === 'function') await res.locals.markExecutionRunning();
        next();
    }).catch((error) => {
        res.removeListener('close', cancelIfQueued);
        if (res.writableEnded || res.destroyed) return;
        if (error?.code === 'EXECUTION_STOPPED') {
            return res.status(200).json({ outcome: 'stopped', logs: ['Execution stopped while queued.'] });
        }
        if (error?.code === 'RESOURCE_CAPACITY_EXCEEDED') {
            res.setHeader('Retry-After', String(Math.ceil(QUEUE_TIMEOUT_MS / 1000)));
            return res.status(503).json({ error: 'RESOURCE_CAPACITY_EXCEEDED', retryAfterMs: QUEUE_TIMEOUT_MS });
        }
        next(error);
    });
}

function getStatus() {
    return {
        ...resourceMonitor.status(),
        maxQueue: MAX_QUEUE,
        queueTimeoutMs: QUEUE_TIMEOUT_MS,
        active: activeCount,
        queued: waitQueue.length
    };
}

function closeQueue() {
    while (waitQueue.length) {
        const item = waitQueue.shift();
        clearTimeout(item.timer);
        item.reject(Object.assign(new Error('Server shutting down'), { code: 'RESOURCE_CAPACITY_EXCEEDED' }));
    }
}

module.exports = { acquire, concurrencyGate, getStatus, closeQueue, drain, cancelQueuedExecution };
