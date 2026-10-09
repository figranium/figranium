const { validateUrl } = require('../../../url-utils');
const { TaskInputError } = require('./run-utils');
const onepassword = require('../../server/onepassword');

const TEMPLATE_TOKEN = /\{\$([\w.^-]+)\}/g;
const PASSWORD_VARIABLE = /^passwords\.([a-z0-9-]+(?:\^[a-z0-9-]+)*)$/i;
const USERNAME_VARIABLE = /^unames\.([a-z0-9-]+(?:\^[a-z0-9-]+)*)$/i;
const TASK_LOGIN_VARIABLES = new Set(['password', 'uname']);

function collectCredentialVariables(value, variables = new Set()) {
    if (typeof value === 'string') {
        for (const match of value.matchAll(TEMPLATE_TOKEN)) {
            const name = match[1].toLowerCase();
            if (name.startsWith('passwords.') || name.startsWith('unames.') || TASK_LOGIN_VARIABLES.has(name)) variables.add(name);
        }
    } else if (Array.isArray(value)) {
        value.forEach(item => collectCredentialVariables(item, variables));
    } else if (value && typeof value === 'object') {
        Object.values(value).forEach(item => collectCredentialVariables(item, variables));
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
    if (Object.keys(runtimeVars).some(name => TASK_LOGIN_VARIABLES.has(name.toLowerCase()))) {
        throw new TaskInputError('password and uname are reserved for the task website Login. Rename the task variable.');
    }
    let lastBlockOutput = null;
    runtimeVars['block.output'] = lastBlockOutput;
    const credentialValues = new Map();
    const getPasswordForDomain = options.getPasswordForDomain || onepassword.getPasswordForDomain;
    const getUsernameForDomain = options.getUsernameForDomain || onepassword.getUsernameForDomain;
    const credentialVariables = collectCredentialVariables(source);
    for (const name of credentialVariables) {
        const passwordMatch = name.match(PASSWORD_VARIABLE);
        const usernameMatch = name.match(USERNAME_VARIABLE);
        const isPassword = name === 'password' || Boolean(passwordMatch);
        if (!TASK_LOGIN_VARIABLES.has(name) && !passwordMatch && !usernameMatch) throw new TaskInputError(`Invalid credential variable: {$${name}}.`);
        let domain;
        if (TASK_LOGIN_VARIABLES.has(name)) {
            try {
                const url = String(source.url || '').replace(TEMPLATE_TOKEN, (_token, key) => String(runtimeVars[key] ?? ''));
                domain = new URL(url).hostname.toLowerCase();
                if (!domain) throw new Error('Missing hostname');
            } catch { throw new TaskInputError(`A valid task website URL is required for {$${name}}.`); }
        } else domain = (passwordMatch || usernameMatch)[1].replace(/\^/g, '.').toLowerCase();
        try {
            credentialValues.set(name, isPassword ? await getPasswordForDomain(domain) : await getUsernameForDomain(domain));
        } catch (error) {
            const messages = {
                ONEPASSWORD_NOT_CONFIGURED: 'Configure 1Password before using password variables.',
                INVALID_PASSWORD_DOMAIN: `Invalid domain in password variable {$${name}}.`,
                PASSWORD_DOMAIN_NOT_FOUND: `No 1Password Login item is mapped to ${domain}.`,
                PASSWORD_NOT_FOUND: `The 1Password Login item for ${domain} has no password.`,
                USERNAME_NOT_FOUND: `The 1Password Login item for ${domain} has no username.`,
                AMBIGUOUS_PASSWORD_DOMAIN: `Multiple 1Password Login items match ${domain}.`,
            };
            throw new TaskInputError(messages[error.code] || `Unable to resolve credential variable for ${domain}.`);
        }
    }
    const redactSensitive = createSecretRedactor([...credentialValues.values()]);

    const setBlockOutput = (value) => {
        lastBlockOutput = value;
        runtimeVars['block.output'] = value;
    };

    const resolveTemplate = (input) => {
        if (typeof input !== 'string' || !input.includes('{$')) return input;
        return input.replace(TEMPLATE_TOKEN, (_match, name) => {
            if (TASK_LOGIN_VARIABLES.has(name.toLowerCase()) || name.toLowerCase().startsWith('passwords.') || name.toLowerCase().startsWith('unames.')) {
                const value = credentialValues.get(name.toLowerCase());
                if (value === undefined) throw new TaskInputError(`Credential variable {$${name}} was not present when the task started.`);
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

module.exports = { createRuntimeContext, normalizeActions, collectCredentialVariables, collectPasswordVariables: collectCredentialVariables, createSecretRedactor };
