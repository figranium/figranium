const http = require('http');
const { spawn } = require('child_process');

const APP_PORT = 11346;
const EXCHANGE_PORT = 11347;
const email = 'cloud-user@example.com';
let consumed = false;

const exchange = http.createServer((req, res) => {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
        const auth = req.headers.authorization;
        const parsed = JSON.parse(body || '{}');
        if (auth !== 'Bearer test-instance-secret' || parsed.code !== 'one-time-code' || consumed) {
            res.writeHead(401, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ error: 'invalid' }));
        }
        consumed = true;
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ email }));
    });
});

function request(path, options = {}) {
    return new Promise((resolve, reject) => {
        const body = options.body ? JSON.stringify(options.body) : null;
        const req = http.request({
            hostname: '127.0.0.1', port: APP_PORT, path,
            method: options.method || 'GET',
            headers: {
                ...(body ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } : {}),
                ...(options.origin ? { Origin: `http://127.0.0.1:${APP_PORT}`, Referer: `http://127.0.0.1:${APP_PORT}/` } : {}),
                ...(options.cookie ? { Cookie: options.cookie } : {})
            }
        }, res => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, data }));
        });
        req.on('error', reject);
        if (body) req.write(body);
        req.end();
    });
}

exchange.listen(EXCHANGE_PORT, '127.0.0.1', () => {
    const app = spawn('node', ['server.js'], { env: {
        ...process.env,
        NODE_ENV: 'test', PORT: String(APP_PORT), SESSION_SECRET: 'cloud-handoff-test-secret',
        FIGRANIUM_CLOUD_AUTH_EXCHANGE_URL: `http://127.0.0.1:${EXCHANGE_PORT}/exchange`,
        FIGRANIUM_CLOUD_INSTANCE_SECRET: 'test-instance-secret'
    }});
    let started = false;
    app.stdout.on('data', async chunk => {
        if (started || !chunk.toString().includes('Server running')) return;
        started = true;
        try {
            await request('/api/auth/setup', { method: 'POST', origin: true, body: { name: 'Cloud User', email, password: 'password123' } });
            const handoff = await request('/api/auth/cloud-handoff?code=one-time-code');
            if (handoff.status !== 303 || handoff.headers.location !== '/') throw new Error(`handoff failed: ${handoff.status}`);
            const cookie = (handoff.headers['set-cookie'] || [])[0]?.split(';')[0];
            if (!cookie) throw new Error('handoff did not create a session cookie');
            const me = await request('/api/auth/me', { cookie });
            const identity = JSON.parse(me.data);
            if (!identity.authenticated || identity.user.email !== email) throw new Error('handoff session identity mismatch');
            const replay = await request('/api/auth/cloud-handoff?code=one-time-code');
            if (replay.status !== 401) throw new Error('one-time code replay was accepted');
            console.log('Cloud auth handoff tests passed');
            app.kill(); exchange.close(() => process.exit(0));
        } catch (error) {
            console.error(error);
            app.kill(); exchange.close(() => process.exit(1));
        }
    });
    app.stderr.on('data', chunk => process.stderr.write(chunk));
});
