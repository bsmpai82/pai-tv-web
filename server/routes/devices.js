const express = require('express');
const db = require('../db/database');

const router = express.Router();

// Listagem
router.get('/', (req, res) => {
    const devices = db.prepare(`
        SELECT d.*,
               p.name  AS playlist_name,
               g.name  AS group_name,
               gp.name AS group_playlist_name,
               v.original_name AS current_video_name
        FROM devices d
        LEFT JOIN playlists p  ON p.id  = d.playlist_id
        LEFT JOIN groups g     ON g.id  = d.group_id
        LEFT JOIN playlists gp ON gp.id = g.playlist_id
        LEFT JOIN videos v     ON v.filename = d.current_video
        ORDER BY d.registered_at DESC
    `).all();

    // Marca online se last_seen nos últimos 10 minutos
    const now = Date.now();
    devices.forEach(d => {
        d.is_online = d.last_seen
            ? (now - new Date(d.last_seen.replace(' ', 'T') + 'Z').getTime()) < 10 * 60 * 1000
            : false;
        // Playlist efetiva: própria ou herdada do grupo
        d.effective_playlist = d.playlist_name || (d.group_playlist_name ? `${d.group_playlist_name} (grupo)` : null);
    });

    const playlists = db.prepare('SELECT * FROM playlists ORDER BY name').all();
    const groups    = db.prepare('SELECT * FROM groups ORDER BY name').all();
    res.render('devices', {
        devices, playlists, groups,
        message: req.query.msg || null, error: req.query.err || null
    });
});

// Nomear dispositivo
router.post('/:id/name', (req, res) => {
    const name = (req.body.name || '').trim();
    if (!name) return res.redirect('/devices?err=Nome+obrigatório.');
    db.prepare('UPDATE devices SET name = ? WHERE id = ?').run(name, req.params.id);
    res.redirect('/devices?msg=Dispositivo+nomeado.');
});

// Atribuir playlist
router.post('/:id/playlist', (req, res) => {
    const playlist_id = req.body.playlist_id || null;
    db.prepare('UPDATE devices SET playlist_id = ?, force_sync = 1 WHERE id = ?').run(playlist_id, req.params.id);
    res.redirect('/devices?msg=Playlist+atribuída.');
});

// Forçar sync em dispositivo específico
router.post('/:id/sync', (req, res) => {
    db.prepare('UPDATE devices SET force_sync = 1 WHERE id = ?').run(req.params.id);
    res.redirect('/devices?msg=Sync+solicitado+para+o+dispositivo.');
});

// Forçar sync em todos os dispositivos
router.post('/sync-all', (req, res) => {
    db.prepare('UPDATE devices SET force_sync = 1').run();
    res.redirect('/devices?msg=Sync+solicitado+para+todos+os+dispositivos.');
});

// Atribuir grupo
router.post('/:id/group', (req, res) => {
    const group_id = req.body.group_id || null;
    db.prepare('UPDATE devices SET group_id = ?, force_sync = 1 WHERE id = ?').run(group_id, req.params.id);
    res.redirect('/devices?msg=Grupo+atribuído.');
});

// Remover dispositivo
router.post('/:id/delete', (req, res) => {
    db.prepare('DELETE FROM devices WHERE id = ?').run(req.params.id);
    res.redirect('/devices?msg=Dispositivo+removido.');
});

module.exports = router;
