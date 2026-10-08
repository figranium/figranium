const fs = require('fs');
const crypto = require('crypto');
const { COOKIE_STATES_FILE } = require('./constants');
const { loadSharedBrowserState } = require('../../browser-storage-state');

let queue = Promise.resolve();
const DEFAULT_COOKIE_STATE_ID = 'cookies_default';
const isLegacyStateless = value => value === true || value === 1 || String(value).toLowerCase() === 'true' || String(value) === '1';
const resolveCookieStateId = (data = {}, taskSnapshot = data.taskSnapshot) => {
    if (isLegacyStateless(data.statelessExecution) || isLegacyStateless(taskSnapshot?.statelessExecution)) return null;
    const requested = data.cookieStateId !== undefined ? data.cookieStateId : taskSnapshot?.cookieStateId;
    return requested === undefined ? DEFAULT_COOKIE_STATE_ID : requested || null;
};
const defaultState = () => ({ id: DEFAULT_COOKIE_STATE_ID, name: 'Default', state: { cookies: [], origins: [] }, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), default: true });
const normalize = (state) => ({
    cookies: (Array.isArray(state?.cookies) ? state.cookies : []).filter(cookie => !cookie.expires || cookie.expires === -1 || cookie.expires > Date.now() / 1000),
    origins: Array.isArray(state?.origins) ? state.origins : []
});
const read = async () => {
    let states = [];
    try { states = JSON.parse(await fs.promises.readFile(COOKIE_STATES_FILE, 'utf8')); } catch { }
    states = Array.isArray(states) ? states : [];
    let changed = false;
    let defaultCookieState = states.find(state => state?.id === DEFAULT_COOKIE_STATE_ID);
    if (!defaultCookieState) {
        defaultCookieState = defaultState();
        states = [defaultCookieState, ...states];
        changed = true;
    }

    // The prior shared browser state is the user's existing session. Carry it
    // into Default once so the new isolated-state model does not sign them out.
    if (!defaultCookieState.sharedMigrationComplete) {
        const sharedState = await loadSharedBrowserState();
        if ((!defaultCookieState.state?.cookies?.length && !defaultCookieState.state?.origins?.length)
            && (sharedState?.cookies?.length || sharedState?.origins?.length)) {
            defaultCookieState.state = normalize(sharedState);
            defaultCookieState.updatedAt = new Date().toISOString();
        }
        defaultCookieState.sharedMigrationComplete = true;
        changed = true;
    }
    if (changed) await write(states);
    return states;
};
const write = async states => { await fs.promises.mkdir(require('path').dirname(COOKIE_STATES_FILE), { recursive: true }); await fs.promises.writeFile(COOKIE_STATES_FILE, JSON.stringify(states, null, 2)); };
const publicState = ({ state, sharedMigrationComplete, ...item }) => ({ ...item, cookies: state.cookies.length, origins: state.origins.length });

async function listCookieStates() { return (await read()).map(publicState); }
async function getCookieState(id) { return (await read()).find(item => item.id === id) || null; }
async function createCookieState(name, state = { cookies: [], origins: [] }) {
    const item = { id: `cookies_${crypto.randomBytes(8).toString('hex')}`, name: String(name || 'Cookie state').trim().slice(0, 120) || 'Cookie state', state: normalize(state), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    await mutate(states => [...states, item]); return item;
}
async function updateCookieState(id, state) { let updated = null; await mutate(states => states.map(item => { if (item.id !== id) return item; updated = { ...item, state: normalize(state), updatedAt: new Date().toISOString() }; return updated; })); return updated; }
async function renameCookieState(id, name) { let updated = null; await mutate(states => states.map(item => { if (item.id !== id) return item; updated = { ...item, name: String(name || '').trim().slice(0, 120) || item.name, updatedAt: new Date().toISOString() }; return updated; })); return updated; }
async function deleteCookieState(id) { if (id === DEFAULT_COOKIE_STATE_ID) return false; let deleted = false; await mutate(states => states.filter(item => { if (item.id === id) { deleted = true; return false; } return true; })); return deleted; }
async function clearCookieStates() { await mutate(() => [defaultState()]); }
async function exportCookieStates() { return await read(); }
async function replaceCookieStates(imported) {
    if (!Array.isArray(imported)) throw new Error('Invalid cookie states');
    const now = new Date().toISOString();
    const states = imported.filter(item => item && typeof item === 'object' && typeof item.id === 'string').map(item => ({
        id: item.id,
        name: String(item.name || 'Cookie state').trim().slice(0, 120) || 'Cookie state',
        state: normalize(item.state),
        createdAt: typeof item.createdAt === 'string' ? item.createdAt : now,
        updatedAt: typeof item.updatedAt === 'string' ? item.updatedAt : now
    }));
    if (!states.some(item => item.id === DEFAULT_COOKIE_STATE_ID)) states.unshift(defaultState());
    await mutate(() => states);
}
async function mutate(transform) { const work = async () => write(transform(await read())); queue = queue.then(work, work); await queue; }
module.exports = { DEFAULT_COOKIE_STATE_ID, resolveCookieStateId, normalize, publicState, listCookieStates, getCookieState, createCookieState, updateCookieState, renameCookieState, deleteCookieState, clearCookieStates, exportCookieStates, replaceCookieStates };
