const assert = require('assert');

process.env.CAPTCHA_SOLVER_URL = 'https://solver.test';
process.env.CAPTCHA_SOLVER_KEY = 'test-client-key';
process.env.SKIP_LOCAL_CAPTCHA_MODEL = 'true';

const { executeAction } = require('../src/agent/figranite/action-handler');

function makeFakePage({ siteKey = 'test-site-key', captchaType = 'recaptcha_v2' } = {}) {
    const evaluations = [];
    return {
        evaluations,
        url: () => 'https://example.com/protected',
        evaluate: async (fn, arg) => {
            evaluations.push({ fn, arg });
            // First call = detection, second call = injection.
            if (evaluations.length === 1) {
                return { siteKey, captchaType };
            }
            if (evaluations.length >= 4) return 'solved-token';
            return undefined;
        }
    };
}

function mockFetchSequence(responses) {
    let i = 0;
    global.fetch = async () => {
        const r = responses[Math.min(i, responses.length - 1)];
        i++;
        return {
            ok: true,
            status: 200,
            json: async () => r
        };
    };
}

async function testSolveCaptchaSuccess() {
    console.log('Testing solve_captcha success path...');
    mockFetchSequence([
        { taskId: 'task_123' },
        { status: 'ready', solution: { gRecaptchaResponse: 'solved-token' } }
    ]);

    const page = makeFakePage();
    const logs = [];
    const runtimeVars = {};
    const context = {
        page,
        logs,
        runtimeVars,
        resolveTemplate: (val) => val,
        options: {}
    };

    const result = await executeAction({ id: 'act_1', type: 'solve_captcha', varName: 'captchaResult', timeout: 5000 }, context);

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.challenge, 'recaptcha_v2');
    assert.strictEqual(runtimeVars.captchaResult.challenge, 'recaptcha_v2');
    assert(page.evaluations.length >= 4, 'Expected detection, user-agent, injection, and completion verification passes');
    assert(logs.some((l) => l.includes('Solving captcha')));
    assert(logs.some((l) => l.includes('Captcha solved')));
    console.log('✓ solve_captcha success path succeeded.');
}

async function testSolveCaptchaNoChallengeFound() {
    console.log('Testing solve_captcha with no challenge on the page...');
    const page = {
        url: () => 'https://example.com/protected',
        evaluate: async () => null
    };
    const context = {
        page,
        logs: [],
        runtimeVars: {},
        resolveTemplate: (val) => val,
        options: {}
    };

    await assert.rejects(
        () => executeAction({ id: 'act_1', type: 'solve_captcha', timeout: 5 }, context),
        /no CAPTCHA challenge.*ready/
    );
    console.log('✓ solve_captcha correctly rejects when no challenge is detected.');
}

async function testSolveCaptchaDistortedText() {
    console.log('Testing solve_captcha with distorted_text...');
    const page = {
        url: () => 'https://example.com/protected',
        locator: () => ({ count: async () => 0, nth: () => null })
    };
    const context = {
        page,
        logs: [],
        runtimeVars: {},
        resolveTemplate: (val) => val,
        options: {}
    };

    const fakeImage = {
        isVisible: async () => true,
        screenshot: async () => Buffer.from('fake-png')
    };
    const pageWithImage = {
        url: () => 'https://example.com/protected',
        locator: (sel) => sel.includes('img') ? { count: async () => 1, nth: () => fakeImage } : { count: async () => 0, nth: () => null }
    };
    const contextWithImage = {
        page: pageWithImage,
        logs: [],
        runtimeVars: {},
        resolveTemplate: (val) => val,
        options: {}
    };

    // SKIP_LOCAL_CAPTCHA_MODEL=true should reject distorted_text as it is local-only
    await assert.rejects(
        () => executeAction({ id: 'act_dt', type: 'solve_captcha', captchaType: 'distorted_text', timeout: 50 }, contextWithImage),
        /local solver is disabled by SKIP_LOCAL_CAPTCHA_MODEL/
    );

    // With SKIP_LOCAL_CAPTCHA_MODEL=false, test readiness failure when no image element is found
    process.env.SKIP_LOCAL_CAPTCHA_MODEL = 'false';
    try {
        await assert.rejects(
            () => executeAction({ id: 'act_dt', type: 'solve_captcha', captchaType: 'distorted_text', timeout: 50 }, context),
            /no CAPTCHA challenge.*ready/
        );
    } finally {
        process.env.SKIP_LOCAL_CAPTCHA_MODEL = 'true';
    }
    console.log('✓ solve_captcha distorted_text rejection and readiness handling succeeded.');
}

async function main() {
    await testSolveCaptchaSuccess();
    await testSolveCaptchaNoChallengeFound();
    await testSolveCaptchaDistortedText();
    console.log('All solve_captcha tests passed!');
}

main().catch((err) => {
    console.error('Test failed:', err);
    process.exit(1);
});
