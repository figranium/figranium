const { Mutex } = require('./utils');

const taskMutex = new Mutex();
const executionStreams = new Map();
const taskStreams = new Map();
const executionListStreams = new Set();
const stopRequests = new Set();

const sendTaskUpdate = (task) => {
    if (!task?.id) return;
    const clients = taskStreams.get(String(task.id));
    if (!clients || clients.size === 0) return;
    const data = `data: ${JSON.stringify({ task })}\n\n`;
    clients.forEach((res) => {
        try { res.write(data); } catch { /* ignore */ }
    });
};

const sendExecutionListUpdate = (payload = {}) => {
    if (executionListStreams.size === 0) return;
    const data = `data: ${JSON.stringify(payload)}\n\n`;
    executionListStreams.forEach((res) => {
        try { res.write(data); } catch { /* ignore */ }
    });
};

const sendExecutionUpdate = (runId, payload) => {
    if (!runId) return;
    const clients = executionStreams.get(runId);
    if (!clients || clients.size === 0) return;
    const data = `data: ${JSON.stringify(payload)}\n\n`;
    clients.forEach((res) => {
        try {
            res.write(data);
        } catch {
            // ignore
        }
    });
};

module.exports = {
    taskMutex,
    executionStreams,
    taskStreams,
    executionListStreams,
    stopRequests,
    sendTaskUpdate,
    sendExecutionListUpdate,
    sendExecutionUpdate
};
