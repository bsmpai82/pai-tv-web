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
        ? `SELECT p.*, COUNT(pi.id) AS item_count
           FROM playlists p
           LEFT JOIN playlist_items pi ON pi.playlist_id = p.id
           WHERE p.owner_id = ?
           GROUP BY p.id
           ORDER BY p.created_at DESC`
        : `SELECT p.*, COUNT(pi.id) AS item_count
           FROM playlists p
           LEFT JOIN playlist_items pi ON pi.playlist_id = p.id
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

    const items = db.prepare(`
        SELECT pi.id AS item_id, pi.media_type, pi.position,
               CASE WHEN pi.media_type = 'video' THEN v.original_name ELSE im.original_name END AS original_name,
               CASE WHEN pi.media_type = 'video' THEN v.size ELSE im.size END AS size,
               im.duration_seconds AS duration_seconds
        FROM playlist_items pi
        LEFT JOIN videos v ON pi.media_type = 'video' AND pi.media_id = v.id
        LEFT JOIN images im ON pi.media_type = 'image' AND pi.media_id = im.id
        WHERE pi.playlist_id = ?
          AND ((pi.media_type = 'video' AND v.id IS NOT NULL) OR (pi.media_type = 'image' AND im.id IS NOT NULL))
        ORDER BY pi.position ASC, pi.id ASC
    `).all(playlist.id);

    // Usuário comum vê apenas os próprios itens disponíveis para adicionar
    const isUser = req.user.role === 'user';
    const allVideos = isUser
        ? db.prepare(`
            SELECT * FROM videos WHERE owner_id = ? AND id NOT IN (
                SELECT media_id FROM playlist_items WHERE playlist_id = ? AND media_type = 'video'
            ) ORDER BY original_name ASC
          `).all(req.user.id, playlist.id)
        : db.prepare(`
            SELECT * FROM videos WHERE id NOT IN (
                SELECT media_id FROM playlist_items WHERE playlist_id = ? AND media_type = 'video'
            ) ORDER BY original_name ASC
          `).all(playlist.id);

    const allImages = isUser
        ? db.prepare(`
            SELECT * FROM images WHERE owner_id = ? AND id NOT IN (
                SELECT media_id FROM playlist_items WHERE playlist_id = ? AND media_type = 'image'
            ) ORDER BY original_name ASC
          `).all(req.user.id, playlist.id)
        : db.prepare(`
            SELECT * FROM images WHERE id NOT IN (
                SELECT media_id FROM playlist_items WHERE playlist_id = ? AND media_type = 'image'
            ) ORDER BY original_name ASC
          `).all(playlist.id);

    res.render('playlist-detail', {
        playlist, items, allVideos, allImages,
        message: req.query.msg || null, error: req.query.err || null
    });
});

// Adicionar item (vídeo ou imagem) à playlist
router.post('/:id/items', (req, res) => {
    const playlist = db.prepare('SELECT * FROM playlists WHERE id = ?').get(req.params.id);
    if (!playlist) return res.redirect('/playlists?err=Playlist+não+encontrada.');
    if (!isOwnerOrElevated(req, playlist)) return res.redirect(`/playlists/${req.params.id}?err=Sem+permissão.`);

    const { media_type, media_id } = req.body;
    if (!['video', 'image'].includes(media_type) || !media_id) {
        return res.redirect(`/playlists/${req.params.id}?err=Selecione+um+item+válido.`);
    }

    const table = media_type === 'video' ? 'videos' : 'images';
    const media = db.prepare(`SELECT owner_id FROM ${table} WHERE id = ?`).get(media_id);
    if (!media) return res.redirect(`/playlists/${req.params.id}?err=Item+não+encontrado.`);
    if (req.user.role === 'user' && media.owner_id !== req.user.id) {
        return res.redirect(`/playlists/${req.params.id}?err=Sem+permissão+para+adicionar+este+item.`);
    }

    const maxPos = db.prepare(`
        SELECT COALESCE(MAX(position), -1) AS max FROM playlist_items WHERE playlist_id = ?
    `).get(req.params.id).max;

    try {
        db.prepare(`
            INSERT INTO playlist_items (playlist_id, media_type, media_id, position) VALUES (?, ?, ?, ?)
        `).run(req.params.id, media_type, media_id, maxPos + 1);
    } catch {
        return res.redirect(`/playlists/${req.params.id}?err=Item+já+está+na+playlist.`);
    }

    const label = media_type === 'video' ? 'Vídeo' : 'Imagem';
    res.redirect(`/playlists/${req.params.id}?msg=${encodeURIComponent(label + ' adicionado(a).')}`);
});

// Remover item da playlist
router.post('/:id/items/:itemId/remove', (req, res) => {
    const playlist = db.prepare('SELECT * FROM playlists WHERE id = ?').get(req.params.id);
    if (!isOwnerOrElevated(req, playlist)) return res.redirect(`/playlists/${req.params.id}?err=Sem+permissão.`);

    db.prepare(`
        DELETE FROM playlist_items WHERE id = ? AND playlist_id = ?
    `).run(req.params.itemId, req.params.id);
    res.redirect(`/playlists/${req.params.id}?msg=Item+removido+da+playlist.`);
});

// Mover item na ordem (direção: up | down)
router.post('/:id/items/:itemId/move', (req, res) => {
    const playlist = db.prepare('SELECT * FROM playlists WHERE id = ?').get(req.params.id);
    if (!isOwnerOrElevated(req, playlist)) return res.redirect(`/playlists/${req.params.id}?err=Sem+permissão.`);

    const playlistId = req.params.id;
    const itemId     = req.params.itemId;
    const direction  = req.body.direction;

    const items = db.prepare(`
        SELECT id, position FROM playlist_items
        WHERE playlist_id = ?
        ORDER BY position ASC, id ASC
    `).all(playlistId);

    const idx = items.findIndex(it => String(it.id) === String(itemId));
    if (idx === -1) return res.redirect(`/playlists/${playlistId}`);

    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= items.length) return res.redirect(`/playlists/${playlistId}`);

    const posA = items[idx].position;
    const posB = items[swapIdx].position;

    db.prepare('UPDATE playlist_items SET position = ? WHERE id = ?').run(posB, itemId);
    db.prepare('UPDATE playlist_items SET position = ? WHERE id = ?').run(posA, items[swapIdx].id);

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
