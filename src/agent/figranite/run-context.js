const { validateUrl } = require('../../../url-utils');
const { TaskInputError } = require('./run-utils');
const onepassword = require('../../server/onepassword');

const TEMPLATE_TOKEN = /\{\$([\w.^-]+)\}/g;
const PASSWORD_VARIABLE = /^passwords\.([a-z0-9-]+(?:\^[a-z0-9-]+)*)$/i;

function collectPasswordVariables(value, variables = new Set()) {
    if (typeof value === 'string') {
        for (const match of value.matchAll(TEMPLATE_TOKEN)) {
            if (match[1].toLowerCase().startsWith('passwords.')) variables.add(match[1].toLowerCase());
        }
    } else if (Array.isArray(value)) {
        value.forEach(item => collectPasswordVariables(item, variables));
    } else if (value && typeof value === 'object') {
        Object.values(value).forEach(item => collectPasswordVariables(item, variables));
    }
    return variables;
}

function createSecretRedactor(secrets) {
    const values = [...new Set(secrets.filter(Boolean))].sort((left, right) => right.length - left.length);
    const redact = value => {
        if (typeof value === 'string') {
            return values.reduce((text, secret) => text.split(secret).join('[REDACTED]'), value);
        }
        if (Array.isArray(value)) return value.map(redact);
        if (value && typeof value === 'object') {
            return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, redact(entry)]));
        }
        return value;
    };
    return redact;
}

async function createRuntimeContext(source, options = {}) {
    const runtimeVars = { ...(source.taskVariables || source.variables || {}) };
    let lastBlockOutput = null;
    runtimeVars['block.output'] = lastBlockOutput;
    const passwordValues = new Map();
    const getPasswordForDomain = options.getPasswordForDomain || onepassword.getPasswordForDomain;
    const passwordVariables = collectPasswordVariables(source);
    for (const name of passwordVariables) {
        const match = name.match(PASSWORD_VARIABLE);
        if (!match) throw new TaskInputError(`Invalid password variable: {$${name}}.`);
        const domain = match[1].replace(/\^/g, '.').toLowerCase();
        try {
            passwordValues.set(name, await getPasswordForDomain(domain));
        } catch (error) {
            const messages = {
                ONEPASSWORD_NOT_CONFIGURED: 'Configure 1Password before using password variables.',
                INVALID_PASSWORD_DOMAIN: `Invalid domain in password variable {$${name}}.`,
                PASSWORD_DOMAIN_NOT_FOUND: `No 1Password Login item is mapped to ${domain}.`,
                PASSWORD_NOT_FOUND: `The 1Password Login item for ${domain} has no password.`,
                AMBIGUOUS_PASSWORD_DOMAIN: `Multiple 1Password Login items match ${domain}.`,
            };
            throw new TaskInputError(messages[error.code] || `Unable to resolve password variable for ${domain}.`);
        }
    }
    const redactSensitive = createSecretRedactor([...passwordValues.values()]);

    const setBlockOutput = (value) => {
        lastBlockOutput = value;
        runtimeVars['block.output'] = value;
    };

    const resolveTemplate = (input) => {
        if (typeof input !== 'string' || !input.includes('{$')) return input;
        return input.replace(TEMPLATE_TOKEN, (_match, name) => {
            if (name.toLowerCase().startsWith('passwords.')) {
                const value = passwordValues.get(name.toLowerCase());
                if (value === undefined) throw new TaskInputError(`Password variable {$${name}} was not present when the task started.`);
                return value;
            }
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

    return { runtimeVars, setBlockOutput, resolveTemplate, redactSensitive };
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

module.exports = { createRuntimeContext, normalizeActions, collectPasswordVariables, createSecretRedactor };
