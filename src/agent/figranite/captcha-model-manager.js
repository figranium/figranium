const crypto = require('crypto');

const DEFAULT_FIPTCHA_URL = 'http://127.0.0.1:11438';
const parseFlag = (value) => ['1', 'true', 'yes', 'on'].includes(String(value || '').trim().toLowerCase());

function checksumBuffer(buffer) {
    return crypto.createHash('sha256').update(buffer).digest('hex');
}

function fiptchaUrl() {
    return String(process.env.FIPTCHA_URL || DEFAULT_FIPTCHA_URL).replace(/\/+$/, '');
}

function requestHeaders(extra = {}) {
    const token = process.env.FIPTCHA_TOKEN;
    return {
        Accept: 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...extra
    };
}

async function readResponse(response) {
    let payload;
    try { payload = await response.json(); }
    catch { throw new Error(`Fiptcha returned malformed JSON (HTTP ${response.status})`); }
    if (!response.ok) throw new Error(payload?.message || payload?.error || `Fiptcha HTTP ${response.status}`);
    return payload;
}

class CaptchaModelManager {
    constructor() {
        this.lastStatus = {
            healthy: false,
            activeTier: null,
            backend: 'fiptcha',
            device: null,
            error: 'Fiptcha has not been contacted yet'
        };
    }

    async start() {
        if (parseFlag(process.env.SKIP_LOCAL_CAPTCHA_MODEL)) return null;
        return this.reconcile();
    }

    async stop() {
        return undefined;
    }

    async reconcile() {
        if (parseFlag(process.env.SKIP_LOCAL_CAPTCHA_MODEL)) return null;
        let response;
        try {
            response = await fetch(`${fiptchaUrl()}/health`, {
                headers: requestHeaders(),
                signal: AbortSignal.timeout(5000)
            });
            const payload = await readResponse(response);
            this.lastStatus = {
                healthy: Boolean(payload?.model?.healthy),
                activeTier: payload?.model?.activeTier || null,
                backend: payload?.model?.backend || 'fiptcha',
                device: payload?.model?.device || null,
                error: payload?.model?.error || null
            };
            return { service: 'fiptcha', status: this.lastStatus };
        } catch (error) {
            this.lastStatus = {
                healthy: false,
                activeTier: null,
                backend: 'fiptcha',
                device: null,
                error: error.message
            };
            throw new Error(`Fiptcha unavailable: ${error.message}`);
        }
    }

    async detect(imageBuffer, label, threshold) {
        if (parseFlag(process.env.SKIP_LOCAL_CAPTCHA_MODEL)) {
            throw new Error('Local CAPTCHA solving disabled by SKIP_LOCAL_CAPTCHA_MODEL');
        }
        const response = await fetch(`${fiptchaUrl()}/detect`, {
            method: 'POST',
            headers: requestHeaders({ 'Content-Type': 'application/json' }),
            body: JSON.stringify({
                image: imageBuffer.toString('base64'),
                label,
                ...(threshold === undefined ? {} : { threshold })
            }),
            signal: AbortSignal.timeout(Number(process.env.FIPTCHA_TIMEOUT_MS) || 120000)
        });
        const payload = await readResponse(response);
        if (payload?.model) {
            this.lastStatus = {
                healthy: Boolean(payload.model.healthy),
                activeTier: payload.model.activeTier || null,
                backend: payload.model.backend || 'fiptcha',
                device: payload.model.device || null,
                error: payload.model.error || null
            };
        }
        return Array.isArray(payload?.detections) ? payload.detections : [];
    }

    status() {
        return { ...this.lastStatus };
    }
}

const captchaModelManager = new CaptchaModelManager();

module.exports = {
    CaptchaModelManager,
    captchaModelManager,
    checksumBuffer,
    parseFlag,
    DEFAULT_FIPTCHA_URL
};
