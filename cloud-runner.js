#!/usr/bin/env node
'use strict';

/**
 * Cloud's data-plane entrypoint. This process has no Express listener, users,
 * sessions, API keys, or authorization decisions. The Cloud control plane must
 * authenticate, authorize, reserve CU and isolate the Sandbox before invoking it.
 *
 * Runs at most one execution per isolated container. Never use for multi-tenant
 * execution in a shared Node process; the underlying engine still uses local
 * filesystem paths and needs a trusted container boundary.
 */
const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

const MAX_INPUT_BYTES = 2 * 1024 * 1024;
const MAX_OUTPUT_BYTES = 4 * 1024 * 1024;
const MAX_DURATION_MS = 15 * 60 * 1000;
const ALLOWED_ENGINES = new Set(['agent', 'scrape']);

function validateEnvelope(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('INVALID_ENVELOPE');
    if (!ALLOWED_ENGINES.has(value.engine)) throw new Error('INVALID_ENGINE');
    if (typeof value.executionId !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(value.executionId)) {
        throw new Error('INVALID_EXECUTION_ID');
    }
    if (!value.task || typeof value.task !== 'object' || Array.isArray(value.task)) throw new Error('INVALID_TASK');
    if (typeof value.task.url !== 'string' || !/^https?:\/\//i.test(value.task.url)) throw new Error('INVALID_TASK_URL');
    if (value.task.runId !== undefined && value.task.runId !== value.executionId) throw new Error('RUN_ID_MISMATCH');
    if (value.timeoutMs !== undefined && (!Number.isSafeInteger(value.timeoutMs) || value.timeoutMs < 1 || value.timeoutMs > MAX_DURATION_MS)) {
        throw new Error('INVALID_TIMEOUT');
    }
    return {
        engine: value.engine,
        executionId: value.executionId,
        task: { ...value.task, runId: value.executionId, isolatedCookies: true },
        timeoutMs: value.timeoutMs ?? MAX_DURATION_MS
    };
}

async function readEnvelope(inputFile) {
    const stat = await fs.stat(inputFile);
    if (!stat.isFile() || stat.size > MAX_INPUT_BYTES) throw new Error('INPUT_TOO_LARGE_OR_INVALID');
    const raw = await fs.readFile(inputFile);
    if (raw.length > MAX_INPUT_BYTES) throw new Error('INPUT_TOO_LARGE');
    return validateEnvelope(JSON.parse(raw.toString('utf8')));
}

function summarizeError(error) {
    // Do not return error.message: upstream errors can contain credentials or URLs.
    return error?.code === 'CLOUD_EXECUTION_TIMEOUT' ? 'CLOUD_EXECUTION_TIMEOUT' : 'CLOUD_ENGINE_FAILURE';
}

async function executeCloudTask(envelope, implementations) {
    const { engine, executionId, task, timeoutMs } = validateEnvelope(envelope);
    const startedAt = Date.now();
    const run = implementations?.[engine] || (engine === 'agent'
        ? require('./agent').runFigranite
        : require('./scrape').runScrape);
    const result = await Promise.race([
        Promise.resolve().then(() => run(task, engine === 'agent' ? { headless: true } : undefined)),
        new Promise((_, reject) => {
            const timer = setTimeout(() => {
                const error = new Error('Execution timeout');
                error.code = 'CLOUD_EXECUTION_TIMEOUT';
                reject(error);
            }, timeoutMs);
            // A real production Sandbox has an independent hard lifetime enforced
            // by Modal; Promise.race alone cannot terminate browser/JS activity.
            timer.unref?.();
        })
    ]);
    return { version: 1, executionId, engine, durationMs: Date.now() - startedAt, outcome: result?.outcome ?? 'unknown', result };
}

async function writePrivateReport(outputFile, report) {
    const serialized = JSON.stringify(report);
    if (!serialized || Buffer.byteLength(serialized) > MAX_OUTPUT_BYTES) throw new Error('OUTPUT_TOO_LARGE');
    const parent = path.dirname(outputFile);
    await fs.mkdir(parent, { recursive: true, mode: 0o700 });
    const tempFile = path.join(parent, `.cloud-result-${randomUUID()}.json`);
    try {
        await fs.writeFile(tempFile, serialized, { mode: 0o600, flag: 'wx' });
        await fs.rename(tempFile, outputFile);
    } finally {
        await fs.rm(tempFile, { force: true }).catch(() => {});
    }
}

async function main(argv = process.argv.slice(2)) {
    if (process.env.FIGRANIUM_RUNTIME !== 'cloud-runner') throw new Error('CLOUD_RUNNER_MODE_REQUIRED');
    if (argv.length !== 2 || !path.isAbsolute(argv[0]) || !path.isAbsolute(argv[1]) || argv[0] === argv[1]) {
        throw new Error('Expected absolute input and output JSON file paths');
    }
    const envelope = await readEnvelope(argv[0]);
    let report;
    let failed = false;
    try {
        report = await executeCloudTask(envelope);
        failed = report.outcome !== 'success';
    } catch (error) {
        failed = true;
        report = { version: 1, executionId: envelope.executionId, engine: envelope.engine, outcome: 'crashed', errorCode: summarizeError(error) };
    }
    await writePrivateReport(argv[1], report);
    // Only protocol metadata goes to stdout; extracted records remain private.
    process.stdout.write(JSON.stringify({ executionId: envelope.executionId, outcome: report.outcome, outputFile: argv[1] }) + '\n');
    if (failed) process.exitCode = 1;
}

if (require.main === module) {
    main().catch(error => {
        // Never print raw task data, exception stacks, or secrets.
        console.error('Cloud runner failed: ' + (String(error?.message || '').startsWith('CLOUD_') ? error.message : 'INVALID_INPUT_OR_OUTPUT'));
        process.exitCode = 1;
    });
}

module.exports = { validateEnvelope, readEnvelope, executeCloudTask, writePrivateReport, main, MAX_DURATION_MS };
