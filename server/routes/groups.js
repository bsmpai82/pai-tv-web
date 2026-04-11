const express = require('express');
const db = require('../db/database');

const router = express.Router();

// Listagem
router.get('/', (req, res) => {
    const groups = db.prepare(`
        SELECT g.*, p.name AS playlist_name, COUNT(d.id) AS device_count
        FROM groups g
        LEFT JOIN playlists p ON p.id = g.playlist_id
        LEFT JOIN devices d ON d.group_id = g.id
        GROUP BY g.id
        ORDER BY g.name ASC
    `).all();
    const playlists = db.prepare('SELECT * FROM playlists ORDER BY name').all();
    res.render('groups', { groups, playlists, message: req.query.msg || null, error: req.query.err || null });
});

// Criar grupo
router.post('/', (req, res) => {
    const name = (req.body.name || '').trim();
    if (!name) return res.redirect('/groups?err=Nome+obrigatório.');
    try {
        db.prepare('INSERT INTO groups (name) VALUES (?)').run(name);
    } catch {
        return res.redirect('/groups?err=Já+existe+um+grupo+com+esse+nome.');
    }
    res.redirect('/groups?msg=Grupo+criado.');
});

// Atribuir playlist ao grupo
router.post('/:id/playlist', (req, res) => {
    const playlist_id = req.body.playlist_id || null;
    db.prepare('UPDATE groups SET playlist_id = ? WHERE id = ?').run(playlist_id, req.params.id);
    // Força sync em todos os dispositivos do grupo que não têm playlist própria
    db.prepare(`
        UPDATE devices SET force_sync = 1
        WHERE group_id = ? AND (playlist_id IS NULL)
    `).run(req.params.id);
    res.redirect('/groups?msg=Playlist+atribuída+ao+grupo.');
});

// Excluir grupo
router.post('/:id/delete', (req, res) => {
    db.prepare('DELETE FROM groups WHERE id = ?').run(req.params.id);
    res.redirect('/groups?msg=Grupo+excluído.');
});

module.exports = router;
