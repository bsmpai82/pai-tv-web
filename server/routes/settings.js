const express = require('express');
const db = require('../db/database');

const router = express.Router();

router.get('/', (req, res) => {
    const emails = db.prepare('SELECT * FROM alert_emails ORDER BY created_at ASC').all();
    const gmailConfigured = !!(process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD);
    res.render('settings', {
        emails,
        gmailConfigured,
        gmailUser: process.env.GMAIL_USER || '',
        message: req.query.msg || null,
        error: req.query.err || null,
    });
});

router.post('/emails', (req, res) => {
    const email = (req.body.email || '').trim().toLowerCase();
    if (!email || !email.includes('@')) return res.redirect('/settings?err=E-mail+inválido.');
    try {
        db.prepare('INSERT INTO alert_emails (email) VALUES (?)').run(email);
        res.redirect('/settings?msg=E-mail+adicionado.');
    } catch {
        res.redirect('/settings?err=E-mail+já+cadastrado.');
    }
});

router.post('/emails/:id/delete', (req, res) => {
    db.prepare('DELETE FROM alert_emails WHERE id = ?').run(req.params.id);
    res.redirect('/settings?msg=E-mail+removido.');
});

module.exports = router;
