#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

function ensureFolateInstalled() {
  if (process.env.FIGRANIUM_SKIP_FOLATE_INSTALL === '1') {
    console.log('[postinstall] Skipping Folate install (FIGRANIUM_SKIP_FOLATE_INSTALL=1).');
    return;
  }

  const venvDir = path.join(os.homedir(), '.figranium', 'folate-venv');
  const venvPython = process.platform === 'win32'
    ? path.join(venvDir, 'Scripts', 'python.exe')
    : path.join(venvDir, 'bin', 'python3');

  const checkSystem = spawnSync('python3', ['-c', 'import folate'], { stdio: 'ignore' });
  if (checkSystem.status === 0) return;

  if (fs.existsSync(venvPython)) {
    const checkVenv = spawnSync(venvPython, ['-c', 'import folate'], { stdio: 'ignore' });
    if (checkVenv.status === 0) return;
  }

  const hasPython = spawnSync('python3', ['--version'], { stdio: 'ignore' });
  if (hasPython.status !== 0) {
    console.warn('[postinstall] python3 not found; skipping local Folate installation.');
    return;
  }

  console.log('[postinstall] Installing local Folate runtime (folate>=0.1.1)...');
  const venvCreate = spawnSync('python3', ['-m', 'venv', venvDir], { stdio: 'inherit' });
  if (venvCreate.status === 0 && fs.existsSync(venvPython)) {
    const venvInstall = spawnSync(venvPython, ['-m', 'pip', 'install', '--no-cache-dir', 'folate>=0.1.1'], { stdio: 'inherit' });
    if (venvInstall.status === 0) return;
  }

  const pipInstall = spawnSync('python3', ['-m', 'pip', 'install', '--no-cache-dir', 'folate>=0.1.1'], { stdio: 'inherit' });
  if (pipInstall.status !== 0) {
    console.warn('[postinstall] Could not automatically install Python package "folate>=0.1.1".');
  }
}

if (process.env.FIGRANIUM_SKIP_PLAYWRIGHT_INSTALL === '1') {
  console.log('[postinstall] Skipping Playwright install (FIGRANIUM_SKIP_PLAYWRIGHT_INSTALL=1).');
  process.exit(0);
}

if (process.env.VERCEL === '1') {
  console.log('[postinstall] Skipping Playwright install (VERCEL=1).');
  process.exit(0);
}

if (process.env.CI === '1') {
  console.log('[postinstall] Skipping Playwright install (CI=1).');
  process.exit(0);
}

if (process.env.PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD === '1') {
  console.log('[postinstall] Skipping Playwright download (PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1).');
  ensureFolateInstalled();
  process.exit(0);
}

const result = spawnSync('npx', ['playwright', 'install', '--with-deps'], {
  stdio: 'inherit',
  shell: process.platform === 'win32'
});

if (result.status === 0) {
  ensureFolateInstalled();
}

process.exit(result.status || 0);
