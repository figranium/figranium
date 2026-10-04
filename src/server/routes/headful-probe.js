module.exports = function registerHeadfulProbeRoute(app, requireAuth) {
    const HEADFUL_PROBE_BYTES = 192 * 1024;
    const headfulProbePayload = Buffer.alloc(HEADFUL_PROBE_BYTES, 0x61);
// Fixed-size, authenticated payload used by the embedded viewer to estimate
// transport throughput. Deliberately cache-proof so each sample is meaningful.
app.get('/api/headful/connection-probe', requireAuth, (req, res) => {
    res.set({
        'Cache-Control': 'no-store, no-cache, must-revalidate, private',
        Pragma: 'no-cache',
        Expires: '0',
        'Content-Type': 'application/octet-stream',
        'Content-Length': String(HEADFUL_PROBE_BYTES)
    });
    res.end(headfulProbePayload);
});

};
