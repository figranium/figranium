const { validateUrl } = require('../../../url-utils');
const { TaskInputError } = require('./run-utils');

async function createRuntimeContext(source) {
    const runtimeVars = { ...(source.taskVariables || source.variables || {}) };
    let lastBlockOutput = null;
    runtimeVars['block.output'] = lastBlockOutput;

    const setBlockOutput = (value) => {
        lastBlockOutput = value;
        runtimeVars['block.output'] = value;
    };

    const resolveTemplate = (input) => {
        if (typeof input !== 'string' || !input.includes('{$')) return input;
        return input.replace(/\{\$([\w.]+)\}/g, (_match, name) => {
            if (name === 'now') return new Date().toISOString();
            const value = runtimeVars[name];
            if (value === undefined || value === null) return '';
            if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
                return String(value);
            }
            try {
                return JSON.stringify(value);
            } catch {
                return String(value);
            }
        });
    };

    const url = source.url;
    if (!url || typeof url !== 'string') {
        throw new TaskInputError('URL is required.');
    }
    try {
        await validateUrl(resolveTemplate(url));
    } catch (error) {
        throw new TaskInputError(error.message || 'Invalid or restricted URL.');
    }

    return { runtimeVars, setBlockOutput, resolveTemplate };
}

function normalizeActions(actions) {
    if (typeof actions === 'string') {
        try {
            actions = JSON.parse(actions);
        } catch (e) {
            throw new TaskInputError('Invalid actions JSON format.');
        }
    }

    if (!actions || !Array.isArray(actions)) {
        throw new TaskInputError('Actions array is required.');
    }

    return actions;
}

module.exports = { createRuntimeContext, normalizeActions };
