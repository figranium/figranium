const assert = require('node:assert/strict');
const { DEFAULT_COOKIE_STATE_ID, resolveCookieStateId } = require('../src/server/cookie-states');

assert.equal(resolveCookieStateId({}), DEFAULT_COOKIE_STATE_ID);
assert.equal(resolveCookieStateId({ cookieStateId: null }), null);
assert.equal(resolveCookieStateId({ cookieStateId: '' }), null);
assert.equal(resolveCookieStateId({ cookieStateId: 'cookies_saved' }), 'cookies_saved');
assert.equal(resolveCookieStateId({ statelessExecution: true, cookieStateId: 'cookies_saved' }), null);
assert.equal(resolveCookieStateId({ taskSnapshot: { statelessExecution: true } }), null);
assert.equal(resolveCookieStateId({ taskSnapshot: { cookieStateId: 'cookies_saved' } }), 'cookies_saved');

console.log('No State resolution checks passed');
