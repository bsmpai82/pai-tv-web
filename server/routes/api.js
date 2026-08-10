const express = require('express');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const db = require('../db/database');
const requireDeviceToken = require('../middleware/requireDeviceToken');
const { log } = require('../services/logger');

const router = express.Router();

// O registro é anônimo — sem limite, qualquer um enche o banco de cadastros falsos.
// Só nesta rota: os endpoints de polling são chamados pelos sticks a cada 5 min.
// Limite generoso porque os sticks de um mesmo local saem todos pelo mesmo IP (NAT),
// e reprovisionar um site inteiro dispara ~12 registros seguidos daquele IP.
const registerLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
});

// Registrar dispositivo — retorna token de autenticação
// POST /api/device/register  { device_uuid }
router.post('/device/register', registerLimiter, (req, res) => {
    const { device_uuid } = req.body;
    if (!device_uuid) return res.status(400).json({ error: 'device_uuid obrigatório.' });

    const uuidCurto = device_uuid.slice(0, 8);
    const existing = db.prepare('SELECT * FROM devices WHERE device_uuid = ?').get(device_uuid);
    if (existing) {
        // Registro interrompido: o dispositivo foi criado mas a resposta se perdeu antes de
        // ele guardar o token, então nunca chegou a se comunicar. É o único caso em que
        // reemitir é seguro — e sai um token novo, não o antigo.
        if (!existing.last_seen) {
            const novoToken = crypto.randomUUID();
            db.prepare('UPDATE devices SET token = ? WHERE id = ?').run(novoToken, existing.id);
            log('dispositivo', `Token reemitido — registro anterior não chegou a se comunicar (UUID: ${uuidCurto}...)`, 'alerta', existing.id);
            return res.json({ status: 'already_registered', device_id: existing.id, token: novoToken });
        }

        // Dispositivo em serviço: nunca devolve o token. Quem descobrir o UUID de um stick
        // não pode se apropriar da credencial dele.
        log('dispositivo', `Tentativa de re-registro de dispositivo em serviço (UUID: ${uuidCurto}...)`, 'alerta', existing.id);
        return res.json({ status: 'already_registered', device_id: existing.id });
    }

    const token = crypto.randomUUID();
    const result = db.prepare(`
        INSERT INTO devices (device_uuid, token) VALUES (?, ?)
    `).run(device_uuid, token);

    log('dispositivo', `Novo dispositivo registrado (UUID: ${uuidCurto}...)`, 'info', result.lastInsertRowid);
    res.status(201).json({ status: 'registered', device_id: result.lastInsertRowid, token });
});

// Heartbeat — atualiza last_seen, versão do app, vídeo em reprodução e IP local
// POST /api/device/:uuid/heartbeat  { app_version?, current_video?, local_ip? }
router.post('/device/:uuid/heartbeat', requireDeviceToken, (req, res) => {
    const { app_version, current_video, local_ip } = req.body;

    db.prepare(`
        UPDATE devices
        SET last_seen     = CURRENT_TIMESTAMP,
            app_version   = COALESCE(?, app_version),
            current_video = COALESCE(?, current_video),
            local_ip      = COALESCE(?, local_ip)
        WHERE id = ?
    `).run(app_version || null, current_video || null, local_ip || null, req.device.id);

    res.json({ status: 'ok' });
});

// Check — retorna hash da playlist e flag force_sync (chamado a cada 5 min pelo app)
// GET /api/device/:uuid/check
router.get('/device/:uuid/check', requireDeviceToken, (req, res) => {
    const device = req.device;

    // Atualiza last_seen
    db.prepare('UPDATE devices SET last_seen = CURRENT_TIMESTAMP WHERE id = ?').run(device.id);

    // Resolve playlist efetiva: própria ou herdada do grupo
    let effectivePlaylistId = device.playlist_id;
    if (!effectivePlaylistId && device.group_id) {
        const group = db.prepare('SELECT playlist_id FROM groups WHERE id = ?').get(device.group_id);
        effectivePlaylistId = group?.playlist_id || null;
    }

    // Calcula hash da playlist atual (inclui duração — mudar a duração de uma imagem já dispara re-sync)
    let playlistHash = 'empty';
    if (effectivePlaylistId) {
        const items = db.prepare(`
            SELECT
                CASE WHEN pi.media_type = 'video' THEN v.filename ELSE im.filename END AS filename,
                CASE WHEN pi.media_type = 'image' THEN im.duration_seconds ELSE NULL END AS duration_seconds
            FROM playlist_items pi
            LEFT JOIN videos v ON pi.media_type = 'video' AND pi.media_id = v.id
            LEFT JOIN images im ON pi.media_type = 'image' AND pi.media_id = im.id
            WHERE pi.playlist_id = ?
            ORDER BY pi.position ASC, pi.id ASC
        `).all(effectivePlaylistId);

        playlistHash = crypto
            .createHash('md5')
            .update(items.map(it => `${it.filename}:${it.duration_seconds ?? ''}`).join(','))
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
router.get('/device/:uuid/playlist', requireDeviceToken, (req, res) => {
    const device = req.device;

    // Resolve playlist efetiva: própria ou herdada do grupo
    let effectivePid = device.playlist_id;
    if (!effectivePid && device.group_id) {
        const group = db.prepare('SELECT playlist_id FROM groups WHERE id = ?').get(device.group_id);
        effectivePid = group?.playlist_id || null;
    }

    if (!effectivePid) {
        return res.json({ playlist: null, videos: [] });
    }

    const playlist = db.prepare('SELECT * FROM playlists WHERE id = ?').get(effectivePid);
    const rawItems = db.prepare(`
        SELECT pi.media_type AS type,
               CASE WHEN pi.media_type = 'video' THEN v.id ELSE im.id END AS id,
               CASE WHEN pi.media_type = 'video' THEN v.filename ELSE im.filename END AS filename,
               CASE WHEN pi.media_type = 'video' THEN v.original_name ELSE im.original_name END AS original_name,
               CASE WHEN pi.media_type = 'video' THEN v.size ELSE im.size END AS size,
               CASE WHEN pi.media_type = 'image' THEN im.duration_seconds ELSE NULL END AS duration_seconds
        FROM playlist_items pi
        LEFT JOIN videos v ON pi.media_type = 'video' AND pi.media_id = v.id
        LEFT JOIN images im ON pi.media_type = 'image' AND pi.media_id = im.id
        WHERE pi.playlist_id = ?
        ORDER BY pi.position ASC, pi.id ASC
    `).all(effectivePid);

    // Zera o flag force_sync após entregar a playlist
    db.prepare('UPDATE devices SET force_sync = 0 WHERE id = ?').run(device.id);

    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const items = rawItems.map(it => ({
        ...it,
        url: `${baseUrl}/media/${it.filename}`,
    }));

    // Array legado (só vídeos) para compatibilidade com APKs antigos
    const videos = items
        .filter(it => it.type === 'video')
        .map(({ id, filename, original_name, size, url }) => ({ id, filename, original_name, size, url }));

    res.json({ playlist: { id: playlist.id, name: playlist.name }, items, videos });
});

module.exports = router;
