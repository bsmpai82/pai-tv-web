const express = require('express');
const crypto = require('crypto');
const db = require('../db/database');

const router = express.Router();

// Registrar dispositivo (primeira execução do app)
// POST /api/device/register  { device_uuid }
router.post('/device/register', (req, res) => {
    const { device_uuid } = req.body;
    if (!device_uuid) return res.status(400).json({ error: 'device_uuid obrigatório.' });

    const existing = db.prepare('SELECT * FROM devices WHERE device_uuid = ?').get(device_uuid);
    if (existing) return res.json({ status: 'already_registered', device_id: existing.id });

    const result = db.prepare(`
        INSERT INTO devices (device_uuid) VALUES (?)
    `).run(device_uuid);

    res.status(201).json({ status: 'registered', device_id: result.lastInsertRowid });
});

// Heartbeat — atualiza last_seen, versão do app e vídeo em reprodução
// POST /api/device/:uuid/heartbeat  { app_version?, current_video? }
router.post('/device/:uuid/heartbeat', (req, res) => {
    const device = db.prepare('SELECT id FROM devices WHERE device_uuid = ?').get(req.params.uuid);
    if (!device) return res.status(404).json({ error: 'Dispositivo não encontrado.' });

    const { app_version, current_video } = req.body;
    db.prepare(`
        UPDATE devices
        SET last_seen = CURRENT_TIMESTAMP,
            app_version  = COALESCE(?, app_version),
            current_video = COALESCE(?, current_video)
        WHERE device_uuid = ?
    `).run(app_version || null, current_video || null, req.params.uuid);

    res.json({ status: 'ok' });
});

// Check — retorna hash da playlist e flag force_sync (chamado a cada 5 min pelo app)
// GET /api/device/:uuid/check
router.get('/device/:uuid/check', (req, res) => {
    const device = db.prepare(`
        SELECT d.*, d.force_sync FROM devices d WHERE d.device_uuid = ?
    `).get(req.params.uuid);

    if (!device) return res.status(404).json({ error: 'Dispositivo não encontrado.' });

    // Atualiza last_seen
    db.prepare('UPDATE devices SET last_seen = CURRENT_TIMESTAMP WHERE device_uuid = ?')
      .run(req.params.uuid);

    // Calcula hash da playlist atual
    let playlistHash = 'empty';
    if (device.playlist_id) {
        const videos = db.prepare(`
            SELECT v.filename FROM videos v
            JOIN playlist_videos pv ON pv.video_id = v.id
            WHERE pv.playlist_id = ?
            ORDER BY pv.position ASC, v.id ASC
        `).all(device.playlist_id);

        playlistHash = crypto
            .createHash('md5')
            .update(videos.map(v => v.filename).join(','))
            .digest('hex');
    }

    res.json({
        playlist_hash: playlistHash,
        force_sync: device.force_sync === 1,
        has_playlist: !!device.playlist_id,
    });
});

// Playlist completa — retorna lista de vídeos com URLs para download
// GET /api/device/:uuid/playlist
router.get('/device/:uuid/playlist', (req, res) => {
    const device = db.prepare('SELECT * FROM devices WHERE device_uuid = ?').get(req.params.uuid);
    if (!device) return res.status(404).json({ error: 'Dispositivo não encontrado.' });

    if (!device.playlist_id) {
        return res.json({ playlist: null, videos: [] });
    }

    const playlist = db.prepare('SELECT * FROM playlists WHERE id = ?').get(device.playlist_id);
    const videos = db.prepare(`
        SELECT v.id, v.filename, v.original_name, v.size
        FROM videos v
        JOIN playlist_videos pv ON pv.video_id = v.id
        WHERE pv.playlist_id = ?
        ORDER BY pv.position ASC, v.id ASC
    `).all(device.playlist_id);

    // Zera o flag force_sync após entregar a playlist
    db.prepare('UPDATE devices SET force_sync = 0 WHERE device_uuid = ?').run(req.params.uuid);

    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const videosWithUrl = videos.map(v => ({
        ...v,
        url: `${baseUrl}/media/${v.filename}`,
    }));

    res.json({ playlist: { id: playlist.id, name: playlist.name }, videos: videosWithUrl });
});

module.exports = router;
