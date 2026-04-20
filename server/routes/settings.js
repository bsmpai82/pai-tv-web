const express = require('express');
const fs = require('fs');
const db = require('../db/database');
const settingsStore = require('../services/settingsStore');
const { apkFilePath } = require('./apk');

const router = express.Router();

const VALID_SCOPES = ['all', 'none', 'specific'];

function parseDeviceIds(raw) {
    const ids = Array.isArray(raw) ? raw : raw ? [raw] : [];
    return ids.map(Number).filter(n => Number.isInteger(n) && n > 0);
}

router.get('/', (req, res) => {
    const emails = db.prepare('SELECT * FROM alert_emails ORDER BY created_at ASC').all();
    const devices = db.prepare('SELECT id, name FROM devices WHERE name IS NOT NULL ORDER BY name ASC').all();

    const emailDeviceMap = {};
    for (const e of emails) {
        emailDeviceMap[e.id] = db.prepare(
            'SELECT device_id FROM alert_email_devices WHERE email_id = ?'
        ).all(e.id).map(r => r.device_id);
    }

    const apkToken = settingsStore.get('apk_download_token');
    let apkInfo = null;
    try {
        const st = fs.statSync(apkFilePath());
        apkInfo = { size: st.size, mtime: st.mtime };
    } catch { /* APK ainda não foi enviado */ }

    res.render('settings', {
        emails,
        devices,
        emailDeviceMap,
        gmailConfigured: !!(process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD),
        gmailUser: process.env.GMAIL_USER || '',
        apkToken,
        apkInfo,
        baseUrl: `${req.protocol}://${req.get('host')}`,
        message: req.query.msg || null,
        error: req.query.err || null,
    });
});

router.post('/emails', (req, res) => {
    const email = (req.body.email || '').trim().toLowerCase();
    if (!email || !email.includes('@')) return res.redirect('/settings?err=E-mail+inválido.');

    const scope = VALID_SCOPES.includes(req.body.scope) ? req.body.scope : 'all';
    const deviceIds = parseDeviceIds(req.body.device_ids);

    try {
        const { lastInsertRowid } = db.prepare(
            'INSERT INTO alert_emails (email, scope) VALUES (?, ?)'
        ).run(email, scope);

        if (scope === 'specific' && deviceIds.length > 0) {
            const ins = db.prepare('INSERT OR IGNORE INTO alert_email_devices (email_id, device_id) VALUES (?, ?)');
            for (const did of deviceIds) ins.run(lastInsertRowid, did);
        }

        res.redirect('/settings?msg=E-mail+adicionado.');
    } catch {
        res.redirect('/settings?err=E-mail+já+cadastrado.');
    }
});

router.post('/emails/:id/devices', (req, res) => {
    const emailId = Number(req.params.id);
    const scope = VALID_SCOPES.includes(req.body.scope) ? req.body.scope : 'all';
    const deviceIds = parseDeviceIds(req.body.device_ids);

    db.prepare('UPDATE alert_emails SET scope = ? WHERE id = ?').run(scope, emailId);
    db.prepare('DELETE FROM alert_email_devices WHERE email_id = ?').run(emailId);

    if (scope === 'specific' && deviceIds.length > 0) {
        const ins = db.prepare('INSERT OR IGNORE INTO alert_email_devices (email_id, device_id) VALUES (?, ?)');
        for (const did of deviceIds) ins.run(emailId, did);
    }

    res.redirect('/settings?msg=Dispositivos+atualizados.');
});

router.post('/emails/:id/delete', (req, res) => {
    db.prepare('DELETE FROM alert_emails WHERE id = ?').run(req.params.id);
    res.redirect('/settings?msg=E-mail+removido.');
});

module.exports = router;
