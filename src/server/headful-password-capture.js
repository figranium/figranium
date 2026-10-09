const crypto = require('crypto');

let pending = null;
let lastFingerprint = null;
let lastAt = 0;

function installPageCapture() {
    if (window.__figraniumPasswordCaptureInstalled) return;
    window.__figraniumPasswordCaptureInstalled = true;
    const collect = (target) => {
        const formsWithPasswords = [...document.querySelectorAll('form')].filter(form => form.querySelector('input[type="password"]'));
        const form = target?.closest?.('form') || target?.form || (formsWithPasswords.length === 1 ? formsWithPasswords[0] : null);
        if (!form) return;
        const inputs = [...form.querySelectorAll('input')];
        const password = inputs.find(input => input.type === 'password' && input.value)?.value;
        if (!password) return;
        const username = inputs.find(input => input.autocomplete === 'username' || input.type === 'email' || /user|email|login/i.test(`${input.name} ${input.id} ${input.placeholder}`))?.value || '';
        window.__figraniumOfferPassword?.({ username, password }).catch(() => {});
    };
    document.addEventListener('submit', event => collect(event.target), true);
    document.addEventListener('click', event => {
        const target = event.target?.closest?.('button, input[type="submit"], [role="button"], .submit');
        if (target && (target.type === 'submit' || target.closest('form') || /log.?in|sign.?in|sign.?up|register|create account/i.test(target.textContent || ''))) collect(target);
    }, true);
}

function offer(sessionId, frameUrl, candidate) {
    let url;
    try { url = new URL(frameUrl); } catch { return; }
    if (!['http:', 'https:'].includes(url.protocol)) return;
    const username = String(candidate?.username || '').trim().slice(0, 255);
    const password = String(candidate?.password || '');
    if (!password || password.length > 4096) return;
    const fingerprint = crypto.createHash('sha256').update(`${sessionId}\0${url.hostname}\0${username}\0${password}`).digest('hex');
    if (fingerprint === lastFingerprint && Date.now() - lastAt < 5000) return;
    lastFingerprint = fingerprint;
    lastAt = Date.now();
    pending = { id: crypto.randomBytes(12).toString('hex'), sessionId, domain: url.hostname.toLowerCase(), url: url.origin, username, password, createdAt: Date.now() };
}

function peek(sessionId) {
    if (pending && Date.now() - pending.createdAt > 120000) pending = null;
    if (!pending || pending.sessionId !== sessionId) return null;
    const { id, domain, username } = pending;
    return { id, domain, username };
}

function take(sessionId, id) {
    if (!pending || pending.sessionId !== sessionId || pending.id !== id) return null;
    const value = pending;
    pending = null;
    return value;
}

function get(sessionId, id) {
    return peek(sessionId)?.id === id ? pending : null;
}

function clear(sessionId) { if (pending?.sessionId === sessionId) pending = null; }

module.exports = { offer, peek, get, take, clear, installPageCapture };
