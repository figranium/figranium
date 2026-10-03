const express = require('express');
const path = require('path');
const { requireAuth } = require('../middleware');
const { loadUsers } = require('../storage');
const { DIST_DIR } = require('../constants');

const router = express.Router();
const serveApp = (_req, res) => res.sendFile(path.join(DIST_DIR, 'index.html'));

// Login page
router.get('/login', async (req, res) => {
    // Check if already logged in
    if (req.session.user) {
        return res.redirect('/');
    }
    // Check if setup is needed
    const users = await loadUsers();
    if (users.length === 0) {
        return res.redirect('/signup');
    }
    serveApp(req, res);
});

// Signup/setup page
router.get('/signup', async (req, res) => {
    const users = await loadUsers();
    if (users.length > 0) {
        return res.redirect('/login');
    }
    serveApp(req, res);
});

module.exports = router;
