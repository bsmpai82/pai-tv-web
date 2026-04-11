const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const db = require('../db/database');

const router = express.Router();

const MAX_SIZE_BYTES = 2 * 1024 * 1024 * 1024; // 2 GB

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const dest = path.resolve(process.env.VIDEOS_PATH || './uploads');
        cb(null, dest);
    },
    filename: (req, file, cb) => {
        const unique = Date.now() + '-' + Math.round(Math.random() * 1e6);
        cb(null, unique + path.extname(file.originalname));
    },
});

const upload = multer({
    storage,
    limits: { fileSize: MAX_SIZE_BYTES },
    fileFilter: (req, file, cb) => {
        if (file.mimetype === 'video/mp4') return cb(null, true);
        cb(new Error('Apenas arquivos MP4 são aceitos.'));
    },
});

// Listagem
router.get('/', (req, res) => {
    const videos = db.prepare(`
        SELECT v.*, COUNT(pv.playlist_id) AS playlist_count
        FROM videos v
        LEFT JOIN playlist_videos pv ON pv.video_id = v.id
        GROUP BY v.id
        ORDER BY v.created_at DESC
    `).all();
    res.render('videos', { videos, message: req.query.msg || null, error: req.query.err || null });
});

// Upload
router.post('/upload', (req, res) => {
    upload.single('video')(req, res, (err) => {
        if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
            return res.redirect('/videos?err=Arquivo+muito+grande+%28máx+2+GB%29.');
        }
        if (err) {
            return res.redirect('/videos?err=' + encodeURIComponent(err.message));
        }
        if (!req.file) {
            return res.redirect('/videos?err=Nenhum+arquivo+enviado.');
        }

        db.prepare(`
            INSERT INTO videos (filename, original_name, size)
            VALUES (?, ?, ?)
        `).run(req.file.filename, req.file.originalname, req.file.size);

        res.redirect('/videos?msg=Vídeo+enviado+com+sucesso.');
    });
});

// Remoção
router.post('/:id/delete', (req, res) => {
    const video = db.prepare('SELECT * FROM videos WHERE id = ?').get(req.params.id);
    if (!video) return res.redirect('/videos?err=Vídeo+não+encontrado.');

    const filePath = path.resolve(process.env.VIDEOS_PATH || './uploads', video.filename);
    try { fs.unlinkSync(filePath); } catch { /* arquivo já removido */ }

    db.prepare('DELETE FROM videos WHERE id = ?').run(video.id);
    res.redirect('/videos?msg=Vídeo+removido.');
});

module.exports = router;
