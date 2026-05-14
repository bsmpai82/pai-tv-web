const express = require('express');
const db = require('../db/database');
const requireRole = require('../middleware/requireRole');

const router = express.Router();

function isOwnerOrElevated(req, playlist) {
    if (!playlist) return false;
    if (req.user.role !== 'user') return true;
    return playlist.owner_id === req.user.id;
}

// Listagem — usuário comum vê apenas suas próprias playlists
router.get('/', (req, res) => {
    const isUser = req.user.role === 'user';
    const query = isUser
        ? `SELECT p.*, COUNT(pv.video_id) AS video_count
           FROM playlists p
           LEFT JOIN playlist_videos pv ON pv.playlist_id = p.id
           WHERE p.owner_id = ?
           GROUP BY p.id
           ORDER BY p.created_at DESC`
        : `SELECT p.*, COUNT(pv.video_id) AS video_count
           FROM playlists p
           LEFT JOIN playlist_videos pv ON pv.playlist_id = p.id
           GROUP BY p.id
           ORDER BY p.created_at DESC`;

    const playlists = isUser
        ? db.prepare(query).all(req.user.id)
        : db.prepare(query).all();

    res.render('playlists', { playlists, message: req.query.msg || null, error: req.query.err || null });
});

// Criar playlist — registra o dono
router.post('/', (req, res) => {
    const name = (req.body.name || '').trim();
    if (!name) return res.redirect('/playlists?err=Nome+obrigatório.');

    db.prepare('INSERT INTO playlists (name, owner_id) VALUES (?, ?)').run(name, req.user.id);
    res.redirect('/playlists?msg=Playlist+criada.');
});

// Detalhe da playlist — usuário comum só acessa as suas
router.get('/:id', (req, res) => {
    const playlist = db.prepare('SELECT * FROM playlists WHERE id = ?').get(req.params.id);
    if (!playlist) return res.redirect('/playlists?err=Playlist+não+encontrada.');
    if (!isOwnerOrElevated(req, playlist)) return res.redirect('/playlists?err=Sem+permissão+para+acessar+esta+playlist.');

    const videos = db.prepare(`
        SELECT v.*, pv.position FROM videos v
        JOIN playlist_videos pv ON pv.video_id = v.id
        WHERE pv.playlist_id = ?
        ORDER BY pv.position ASC, v.original_name ASC
    `).all(playlist.id);

    // Usuário comum vê apenas os próprios vídeos disponíveis para adicionar
    const isUser = req.user.role === 'user';
    const allVideos = isUser
        ? db.prepare(`
            SELECT * FROM videos WHERE owner_id = ? AND id NOT IN (
                SELECT video_id FROM playlist_videos WHERE playlist_id = ?
            ) ORDER BY original_name ASC
          `).all(req.user.id, playlist.id)
        : db.prepare(`
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
    const playlist = db.prepare('SELECT * FROM playlists WHERE id = ?').get(req.params.id);
    if (!playlist) return res.redirect('/playlists?err=Playlist+não+encontrada.');
    if (!isOwnerOrElevated(req, playlist)) return res.redirect(`/playlists/${req.params.id}?err=Sem+permissão.`);

    const { video_id } = req.body;
    if (!video_id) return res.redirect(`/playlists/${req.params.id}?err=Selecione+um+vídeo.`);

    // Usuário comum só pode adicionar vídeos próprios
    if (req.user.role === 'user') {
        const video = db.prepare('SELECT owner_id FROM videos WHERE id = ?').get(video_id);
        if (!video || video.owner_id !== req.user.id) {
            return res.redirect(`/playlists/${req.params.id}?err=Sem+permissão+para+adicionar+este+vídeo.`);
        }
    }

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
    const playlist = db.prepare('SELECT * FROM playlists WHERE id = ?').get(req.params.id);
    if (!isOwnerOrElevated(req, playlist)) return res.redirect(`/playlists/${req.params.id}?err=Sem+permissão.`);

    db.prepare(`
        DELETE FROM playlist_videos WHERE playlist_id = ? AND video_id = ?
    `).run(req.params.id, req.params.videoId);
    res.redirect(`/playlists/${req.params.id}?msg=Vídeo+removido+da+playlist.`);
});

// Mover vídeo na ordem (direção: up | down)
router.post('/:id/videos/:videoId/move', (req, res) => {
    const playlist = db.prepare('SELECT * FROM playlists WHERE id = ?').get(req.params.id);
    if (!isOwnerOrElevated(req, playlist)) return res.redirect(`/playlists/${req.params.id}?err=Sem+permissão.`);

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

    const posA = videos[idx].position;
    const posB = videos[swapIdx].position;

    db.prepare('UPDATE playlist_videos SET position = ? WHERE playlist_id = ? AND video_id = ?')
      .run(posB, playlistId, videoId);
    db.prepare('UPDATE playlist_videos SET position = ? WHERE playlist_id = ? AND video_id = ?')
      .run(posA, playlistId, videos[swapIdx].video_id);

    res.redirect(`/playlists/${playlistId}`);
});

// Forçar sync — apenas master e admin
router.post('/:id/sync', requireRole('master', 'admin'), (req, res) => {
    db.prepare(`
        UPDATE devices SET force_sync = 1
        WHERE playlist_id = ?
           OR group_id IN (SELECT id FROM groups WHERE playlist_id = ?)
    `).run(req.params.id, req.params.id);
    res.redirect(`/playlists/${req.params.id}?msg=Sync+solicitado+para+todos+os+dispositivos+desta+playlist.`);
});

// Excluir playlist — usuário comum só deleta as suas
router.post('/:id/delete', (req, res) => {
    const playlist = db.prepare('SELECT * FROM playlists WHERE id = ?').get(req.params.id);
    if (!playlist) return res.redirect('/playlists?err=Playlist+não+encontrada.');
    if (!isOwnerOrElevated(req, playlist)) return res.redirect('/playlists?err=Sem+permissão+para+excluir+esta+playlist.');

    db.prepare('DELETE FROM playlists WHERE id = ?').run(req.params.id);
    res.redirect('/playlists?msg=Playlist+excluída.');
});

module.exports = router;
