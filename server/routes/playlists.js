const express = require('express');
const db = require('../db/database');

const router = express.Router();

// Listagem
router.get('/', (req, res) => {
    const playlists = db.prepare(`
        SELECT p.*, COUNT(pv.video_id) AS video_count
        FROM playlists p
        LEFT JOIN playlist_videos pv ON pv.playlist_id = p.id
        GROUP BY p.id
        ORDER BY p.created_at DESC
    `).all();
    res.render('playlists', { playlists, message: req.query.msg || null, error: req.query.err || null });
});

// Criar playlist
router.post('/', (req, res) => {
    const name = (req.body.name || '').trim();
    if (!name) return res.redirect('/playlists?err=Nome+obrigatório.');

    db.prepare('INSERT INTO playlists (name) VALUES (?)').run(name);
    res.redirect('/playlists?msg=Playlist+criada.');
});

// Detalhe da playlist
router.get('/:id', (req, res) => {
    const playlist = db.prepare('SELECT * FROM playlists WHERE id = ?').get(req.params.id);
    if (!playlist) return res.redirect('/playlists?err=Playlist+não+encontrada.');

    const videos = db.prepare(`
        SELECT v.*, pv.position FROM videos v
        JOIN playlist_videos pv ON pv.video_id = v.id
        WHERE pv.playlist_id = ?
        ORDER BY pv.position ASC, v.original_name ASC
    `).all(playlist.id);

    const allVideos = db.prepare(`
        SELECT * FROM videos WHERE id NOT IN (
            SELECT video_id FROM playlist_videos WHERE playlist_id = ?
        ) ORDER BY original_name ASC
    `).all(playlist.id);

    res.render('playlist-detail', {
        playlist, videos, allVideos,
        message: req.query.msg || null, error: req.query.err || null
    });
});

// Adicionar vídeo à playlist
router.post('/:id/videos', (req, res) => {
    const { video_id } = req.body;
    if (!video_id) return res.redirect(`/playlists/${req.params.id}?err=Selecione+um+vídeo.`);

    const maxPos = db.prepare(`
        SELECT COALESCE(MAX(position), -1) AS max FROM playlist_videos WHERE playlist_id = ?
    `).get(req.params.id).max;

    try {
        db.prepare(`
            INSERT INTO playlist_videos (playlist_id, video_id, position) VALUES (?, ?, ?)
        `).run(req.params.id, video_id, maxPos + 1);
    } catch {
        return res.redirect(`/playlists/${req.params.id}?err=Vídeo+já+está+na+playlist.`);
    }

    res.redirect(`/playlists/${req.params.id}?msg=Vídeo+adicionado.`);
});

// Remover vídeo da playlist
router.post('/:id/videos/:videoId/remove', (req, res) => {
    db.prepare(`
        DELETE FROM playlist_videos WHERE playlist_id = ? AND video_id = ?
    `).run(req.params.id, req.params.videoId);
    res.redirect(`/playlists/${req.params.id}?msg=Vídeo+removido+da+playlist.`);
});

// Mover vídeo na ordem (direção: up | down)
router.post('/:id/videos/:videoId/move', (req, res) => {
    const playlistId = req.params.id;
    const videoId    = req.params.videoId;
    const direction  = req.body.direction;

    const videos = db.prepare(`
        SELECT video_id, position FROM playlist_videos
        WHERE playlist_id = ?
        ORDER BY position ASC, video_id ASC
    `).all(playlistId);

    const idx = videos.findIndex(v => String(v.video_id) === String(videoId));
    if (idx === -1) return res.redirect(`/playlists/${playlistId}`);

    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= videos.length) return res.redirect(`/playlists/${playlistId}`);

    // Troca as posições dos dois vídeos
    const posA = videos[idx].position;
    const posB = videos[swapIdx].position;

    db.prepare('UPDATE playlist_videos SET position = ? WHERE playlist_id = ? AND video_id = ?')
      .run(posB, playlistId, videoId);
    db.prepare('UPDATE playlist_videos SET position = ? WHERE playlist_id = ? AND video_id = ?')
      .run(posA, playlistId, videos[swapIdx].video_id);

    res.redirect(`/playlists/${playlistId}`);
});

// Forçar sync em todos os dispositivos que usam esta playlist (direta ou via grupo)
router.post('/:id/sync', (req, res) => {
    db.prepare(`
        UPDATE devices SET force_sync = 1
        WHERE playlist_id = ?
           OR group_id IN (SELECT id FROM groups WHERE playlist_id = ?)
    `).run(req.params.id, req.params.id);
    res.redirect(`/playlists/${req.params.id}?msg=Sync+solicitado+para+todos+os+dispositivos+desta+playlist.`);
});

// Excluir playlist
router.post('/:id/delete', (req, res) => {
    db.prepare('DELETE FROM playlists WHERE id = ?').run(req.params.id);
    res.redirect('/playlists?msg=Playlist+excluída.');
});

module.exports = router;
