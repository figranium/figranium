const express = require('express');

const router = express.Router();

function runtimeVersion() {
    try { return require('../../../package.json').version; } catch { return '0.0.0'; }
}

// This is intentionally public and declarative. Clients such as Director can
// render runtime-provided functionality without coupling to JSON storage or a
// particular version-number ladder.
router.get('/', (_req, res) => {
    res.json({
        apiVersion: '1',
        runtimeVersion: runtimeVersion(),
        features: {
            tasks: true,
            executions: true,
            executionStreaming: true,
            schedules: true,
            captures: true,
            cabinets: true,
            selectorStreaming: true,
            headfulSessions: true,
            externalCDP: false
        },
        browser: {
            headful: true,
            selectorStreaming: true,
            externalCDP: false
        },
        actions: [
            'navigate', 'click', 'type', 'wait_selector', 'wait_time', 'press',
            'hover', 'scroll', 'javascript', 'screenshot', 'get_content',
            'extract', 'check', 'uncheck', 'select', 'drag_drop', 'reload',
            'upload', 'download', 'if', 'while', 'repeat', 'foreach', 'http_request',
            'wait_for_captcha', 'solve_captcha'
        ].map(type => ({ type, title: type.replace(/_/g, ' '), configurationSchema: null }))
    });
});

module.exports = router;
