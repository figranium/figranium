async function handleAgent(req, res, { runFigranite, reportProgress, resolveTaskOutcome, clearStopRequest }) {
    const data = (req.method === 'POST') ? req.body : req.query;
    const options = {
        localPort: req.socket && req.socket.localPort,
        protocol: req.protocol
    };

    try {
        const result = await runFigranite(data, options);
        reportProgress(data.runId, { status: 'finished', outcome: result.outcome });
        res.json(result);
    } catch (error) {
        if (error.isTaskInputError) {
            return res.status(400).json({ error: error.code, details: error.message });
        }
        const outcome = resolveTaskOutcome({ antiBot: Boolean(error.antiBotReason), crashed: true });
        const logs = Array.isArray(error.executionLogs) ? error.executionLogs : [];
        if (outcome === 'crashed') logs.push(`[OUTCOME] Execution crashed: ${error.message}.`);
        reportProgress(data.runId, { status: 'finished', outcome });
        res.json({ outcome, error: 'Figranite Engine failed', details: error.message, logs });
    } finally {
        clearStopRequest(data.runId);
    }
}


module.exports = (dependencies) => (req, res) => handleAgent(req, res, dependencies);
