const TRANSLATE_JS_URL = 'https://cdnjs.cloudflare.com/ajax/libs/translate.js/3.18.66/translate.min.js';

function getTranslationTarget(settings) {
    if (!settings || settings.enabled !== true) return null;
    const target = String(settings.targetLanguage || 'english').trim().toLowerCase();
    return /^[a-z_]+$/.test(target) ? target : 'english';
}

async function installPageTranslation(page, settings, logs = []) {
    const targetLanguage = getTranslationTarget(settings);
    if (!targetLanguage) return () => {};

    let translating = false;
    let translatedUrl = null;

    const translateCurrentDocument = async () => {
        const url = page.url();
        if (!url.startsWith('http') || translating || translatedUrl === url) return;
        translating = true;
        try {
            await page.addScriptTag({ url: TRANSLATE_JS_URL });
            await page.evaluate((target) => {
                const translator = window.translate;
                if (!translator) throw new Error('translate.js did not initialize.');
                translator.service.use('client.edge');
                translator.language.setDefaultTo(target);
                translator.listener.start();
                translator.execute();
                translator.changeLanguage(target);
            }, targetLanguage);
            translatedUrl = url;
            logs.push(`[TRANSLATION] Requested ${targetLanguage} translation for ${url}.`);
        } catch (error) {
            logs.push(`[TRANSLATION] Could not translate ${url}: ${error.message}`);
        } finally {
            translating = false;
        }
    };

    const onDomContentLoaded = () => { translateCurrentDocument(); };
    page.on('domcontentloaded', onDomContentLoaded);
    await translateCurrentDocument();

    return () => page.off('domcontentloaded', onDomContentLoaded);
}

module.exports = { getTranslationTarget, installPageTranslation };
