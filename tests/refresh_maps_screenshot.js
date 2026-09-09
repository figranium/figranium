const { chromium } = require('playwright');
const fs = require('fs');

const APP = 'http://127.0.0.1:11345';
const PRESET_FILE = process.env.PRESET_FILE || '/tmp/maps-preset.json';
const OUTPUT = process.env.OUTPUT || 'verification/maps-lead-scraper-screenshot.png';

function normalizePreset(raw) {
  let value = raw;
  if (value && typeof value === 'object' && 'configuration' in value) value = value.configuration;
  if (typeof value === 'string') value = JSON.parse(value);
  if (Array.isArray(value)) return value[0];
  if (value && Array.isArray(value.tasks)) return value.tasks[0];
  if (value && value.task && typeof value.task === 'object') return value.task;
  return value;
}

async function main() {
  const raw = JSON.parse(fs.readFileSync(PRESET_FILE, 'utf8'));
  const task = normalizePreset(raw);
  if (!task || typeof task !== 'object') throw new Error('Could not normalize preset configuration');
  console.log('Preset task:', task.name, 'mode=', task.mode, 'actions=', task.actions?.length);

  fs.mkdirSync(require('path').dirname(OUTPUT), { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const page = await context.newPage();

  await page.goto(APP, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1200);

  const email = page.locator('#auth-email');
  if (await email.count()) {
    if (await page.locator('#auth-name').count()) {
      await page.fill('#auth-name', 'Figranium');
      await page.fill('#auth-email', 'screenshot@example.com');
      await page.fill('#auth-pass', 'FigraniumScreenshot123!');
      await page.fill('#auth-pass-confirm', 'FigraniumScreenshot123!');
    } else {
      await page.fill('#auth-email', 'screenshot@example.com');
      await page.fill('#auth-pass', 'FigraniumScreenshot123!');
    }
    await page.click('button[type="submit"]');
  }

  await page.waitForSelector('[data-testid="sidebar-dashboard"]', { timeout: 20000 });
  await page.evaluate(() => localStorage.setItem('figranium.seenThemeIntro', 'true'));

  const created = await page.evaluate(async (task) => {
    const headers = { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' };
    const listed = await fetch('/api/tasks', { headers: { 'X-Requested-With': 'XMLHttpRequest' } });
    const tasks = await listed.json();
    const existing = Array.isArray(tasks) ? tasks.find(t => t.name === task.name) : null;
    const res = existing
      ? await fetch(`/api/tasks/${existing.id}`, { method: 'PUT', headers, body: JSON.stringify(task) })
      : await fetch('/api/tasks', { method: 'POST', headers, body: JSON.stringify(task) });
    const text = await res.text();
    if (!res.ok) throw new Error(`Task save failed ${res.status}: ${text}`);
    try { return JSON.parse(text); } catch { return { text }; }
  }, task);
  console.log('Task import response:', JSON.stringify(created).slice(0, 500));

  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-testid="sidebar-dashboard"]', { timeout: 15000 });
  await page.waitForTimeout(1000);

  const taskName = task.name || 'Google Maps Lead Scraper';
  const nameNode = page.getByText(taskName, { exact: true }).first();
  await nameNode.waitFor({ state: 'visible', timeout: 15000 });

  let card = nameNode.locator('xpath=ancestor::*[.//button[contains(normalize-space(.), "Edit Task")]][1]');
  if (!(await card.count())) card = nameNode.locator('xpath=ancestor::div[1]');
  const edit = card.getByRole('button', { name: /Edit Task/i });
  if (await edit.count()) {
    await edit.first().click();
  } else {
    await page.getByRole('button', { name: /Edit Task/i }).first().click();
  }

  await page.waitForTimeout(1800);
  await page.getByText(taskName, { exact: true }).first().waitFor({ state: 'visible', timeout: 15000 }).catch(() => {});

  // Match the README-style app screenshot: real UI only, no browser chrome, no annotations.
  await page.screenshot({ path: OUTPUT, fullPage: false });
  console.log('Saved', OUTPUT, 'title=', await page.title(), 'url=', page.url());
  await browser.close();
}

main().catch(err => { console.error(err); process.exit(1); });
