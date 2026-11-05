// Browser engine adapter using playwright-extra + puppeteer-extra-plugin-stealth
// (stock Playwright Chromium patched with JS-level evasions).

let legacyChromium = null;
function getLegacyChromium() {
    if (!legacyChromium) {
        const { chromium } = require('playwright-extra');
        const StealthPlugin = require('puppeteer-extra-plugin-stealth');

        const stealth = StealthPlugin();
        stealth.enabledEvasions.clear();
        [
            'chrome.app',
            'chrome.csi',
            'chrome.loadTimes',
            'chrome.runtime',
            'defaultArgs',
            'iframe.contentWindow',
            'media.codecs',
            'navigator.hardwareConcurrency',
            'navigator.languages',
            'navigator.permissions',
            'navigator.plugins',
            'navigator.webdriver',
            'sourceurl',
            'user-agent-override',
            'webgl.vendor',
            'window.outerdimensions'
        ].forEach(e => stealth.enabledEvasions.add(e));
        chromium.use(stealth);
        legacyChromium = chromium;
    }
    return legacyChromium;
}

async function launch(options) {
    return getLegacyChromium().launch(options);
}

async function launchPersistentContext(userDataDir, options = {}) {
    return getLegacyChromium().launchPersistentContext(userDataDir, options);
}

// `chromium`-shaped export keeps existing callers (headful.js, src/agent/browser.js) working unchanged.
const chromium = { launch, launchPersistentContext };

module.exports = { launch, launchPersistentContext, chromium };
