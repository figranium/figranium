const express = require('express');
const { getPool } = require('../db');
const { getStatus: getExecutionQueueStatus } = require('../execution-queue');
const { getCaptchaResourceStatus } = require('../captcha-resources');

const router = express.Router();
const startTime = Date.now();

router.get('/', async (req, res) => {
    let version = '0.0.0';
    try { version = require('../../../package.json').version; } catch { }
    const status = { status: 'ok', uptime: Math.floor((Date.now() - startTime) / 1000), version };

    const pool = getPool();
    if (pool) {
        status.storage = 'postgres';
        try {
            await pool.query('SELECT 1');
        } catch (err) {
            status.status = 'degraded';
            status.storage_error = 'Database unreachable';
        }
    } else {
        status.storage = 'json';
    }
    status.protection = getExecutionQueueStatus();
    status.captcha = getCaptchaResourceStatus();

    const httpStatus = status.status === 'ok' ? 200 : 503;
    res.status(httpStatus).json(status);
});

module.exports = router;
