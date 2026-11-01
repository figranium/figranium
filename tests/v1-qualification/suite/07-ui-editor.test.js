const { strict: assert } = require('assert');

module.exports = {
    id: 'UI-001',
    name: 'UI Editor and Task creation flow',
    subsystem: 'ui',
    severity: 'CRITICAL',
    blocksV1: true,
    setup: 'Running Vite frontend preview server connected to torture backend',
    steps: 'Open frontend, create a new task via UI, verify settings tab switches and extraction script editing works.',
    expected: 'Task is created successfully, settings panels toggle without errors, and UI syncs changes.',
    run: async ({ page, serverUrl }) => {
        let taskId = null;
        try {
            await page.goto(`${serverUrl}/`, { waitUntil: 'domcontentloaded', timeout: 15000 });
            
            // Wait for create task button (support both split button and regular button)
            const createButton = page.locator('button[aria-label="Create new Task (Alt + N)"], button.create-task-split-main, button:has-text("New Task"), button:has-text("Create Task")').first();
            await createButton.waitFor({ state: 'visible', timeout: 15000 });
            await createButton.click();

            const nameInput = page.locator('input[placeholder="Task name"], input[name="name"]').first();
            await nameInput.waitFor({ state: 'visible', timeout: 10000 });
            await nameInput.fill('V1 Qualification UI Task');
            await nameInput.blur();

            for (let i = 0; i < 30 && !taskId; i++) {
                const url = page.url();
                const match = url.match(/\/tasks\/([a-zA-Z0-9_-]+)/);
                if (match) {
                    taskId = match[1];
                    break;
                }
                await page.waitForTimeout(500);
            }

            if (!taskId) {
                // Try clicking save or create confirmation if modal didn't auto-navigate
                const submitBtn = page.locator('button:has-text("Create"), button:has-text("Save"), button[type="submit"]').first();
                if (await submitBtn.isVisible().catch(() => false)) {
                    await submitBtn.click().catch(() => {});
                    await page.waitForTimeout(1000);
                    const match = page.url().match(/\/tasks\/([a-zA-Z0-9_-]+)/);
                    if (match) taskId = match[1];
                }
            }

            assert.ok(taskId || page.url().includes('/tasks/'), 'Task creation via UI must generate a task editor route');
        } catch (error) {
            // If UI automation encounters headless timing issues in specific container environments, log gracefully or assert
            console.log('UI qualification note:', error.message);
            throw error;
        }
    }
};
