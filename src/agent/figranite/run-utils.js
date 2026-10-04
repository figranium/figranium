const { solveCaptcha } = require('./captcha-client');
const { consumeStopRequest } = require('../execution-control');

// Action types after which an auto-solve pass (task-level `autoSolveCaptcha`) checks for
// a challenge — the points where navigation or a form interaction commonly triggers one.
const AUTO_CAPTCHA_TRIGGER_TYPES = new Set(['navigate', 'goto', 'click', 'type', 'fill']);

async function maybeAutoSolveCaptcha({ enabled, actionType, page, logs, identity }) {
    if (!enabled || !AUTO_CAPTCHA_TRIGGER_TYPES.has(actionType)) return;
    try {
        const detectionTimeout = Math.max(1, Number(process.env.CAPTCHA_AUTO_DETECT_TIMEOUT_MS) || 5000);
        const result = await solveCaptcha(page, { timeout: 120000, detectionTimeout, logs, identity });
        logs.push(`Auto-solved captcha: ${result.challenge} (${result.duration}ms)`);
    } catch (err) {
        if (err && err.noChallengeFound) return;
        logs.push(`[CAPTCHA ERROR] Auto-solve attempt failed: ${err.message}`);
    }
}

let progressReporter = null;
const setProgressReporter = (reporter) => {
    progressReporter = reporter;
};

const reportProgress = (runId, payload) => {
    if (!runId || typeof progressReporter !== 'function') return;
    try {
        progressReporter(runId, payload);
    } catch {
        // ignore
    }
};

const TEST_INPUT_FIELDS = [
    'selector', 'value', 'key', 'conditionVar', 'conditionVarType', 'conditionOp',
    'conditionValue', 'typeMode', 'method', 'headers', 'body', 'timeout', 'captchaType',
    'cabinetId', 'markAsUploaded', 'clickType', 'targetSelector',
];

const buildResolvedActionInputs = (action, resolveTemplate) => {
    const inputs = {};
    for (const key of TEST_INPUT_FIELDS) {
        const value = action?.[key];
        if (value === undefined || value === null || value === '') continue;
        inputs[key] = typeof value === 'string' ? resolveTemplate(value) : value;
    }
    return inputs;
};

const snapshotTestVariables = (runtimeVars) => Object.fromEntries(
    Object.entries(runtimeVars || {}).filter(([name]) => name !== 'html')
);

const isStopRequested = (runId) => {
    return consumeStopRequest(runId);
};

class TaskInputError extends Error {
    constructor(message) {
        super(message);
        this.name = 'TaskInputError';
        this.code = 'INVALID_TASK_INPUT';
        this.isTaskInputError = true;
    }
}

module.exports = {
    maybeAutoSolveCaptcha, setProgressReporter, reportProgress,
    buildResolvedActionInputs, snapshotTestVariables, isStopRequested, TaskInputError
};
