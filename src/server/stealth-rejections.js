// Catch unhandled promise rejections from playwright-extra stealth plugin.
// When pages close before the plugin finishes async CDP initialization,
// benign rejections bubble up and would otherwise crash the process.
process.on('unhandledRejection', (reason) => {
    const msg = reason && reason.message ? reason.message : String(reason);
    if (/Target page, context or browser has been closed/i.test(msg)) {
        console.warn('[STEALTH] Suppressed benign rejection:', msg);
        return;
    }
    console.error('Unhandled rejection:', reason);
});


module.exports = true;
