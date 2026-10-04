const crypto = require('crypto');
const VNC_TICKET_TTL_MS = 60_000;
const vncViewerTickets = new Map();

const createVncViewerTicket = (sessionId) => {
    const now = Date.now();
    for (const [token, ticket] of vncViewerTickets) {
        if (ticket.expiresAt <= now) vncViewerTickets.delete(token);
    }
    const token = crypto.randomBytes(32).toString('base64url');
    vncViewerTickets.set(token, { sessionId, expiresAt: now + VNC_TICKET_TTL_MS });
    return token;
};

const consumeVncViewerTicket = (token, sessionId) => {
    if (!token || !sessionId) return false;
    const ticket = vncViewerTickets.get(token);
    vncViewerTickets.delete(token);
    return !!ticket && ticket.expiresAt > Date.now() && ticket.sessionId === sessionId;
};

module.exports = { createVncViewerTicket, consumeVncViewerTicket };
