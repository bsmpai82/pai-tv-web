const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { execFile } = require('child_process');
const db = require('../db/database');

const THUMBS_PATH = process.env.THUMBS_PATH || '/srv/pai_tv/thumbs';

function generateThumb(videoPath, thumbPath) {
    return new Promise((resolve) => {
        execFile('ffmpeg', [
            '-ss', '00:00:01',
            '-i', videoPath,
            '-frames:v', '1',
            '-vf', 'scale=320:-1',
            '-y', thumbPath
        ], (err) => {
            if (err) console.warn('Thumbnail não gerado:', err.message);
            resolve();
        });
    });
}

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
    upload.single('video')(req, res, async (err) => {
        if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
            return res.redirect('/videos?err=Arquivo+muito+grande+%28máx+2+GB%29.');
        }
        if (err) {
            return res.redirect('/videos?err=' + encodeURIComponent(err.message));
        }
        if (!req.file) {
            return res.redirect('/videos?err=Nenhum+arquivo+enviado.');
        }

        const originalName = Buffer.from(req.file.originalname, 'latin1').toString('utf8');
        const thumbName = path.basename(req.file.filename, path.extname(req.file.filename)) + '.jpg';
        const videoPath = path.resolve(process.env.VIDEOS_PATH || './uploads', req.file.filename);
        const thumbPath = path.resolve(THUMBS_PATH, thumbName);

        await generateThumb(videoPath, thumbPath);

        db.prepare(`
            INSERT INTO videos (filename, original_name, size, thumb)
            VALUES (?, ?, ?, ?)
        `).run(req.file.filename, originalName, req.file.size, thumbName);

        res.redirect('/videos?msg=Vídeo+enviado+com+sucesso.');
    });
});

// Remoção
router.post('/:id/delete', (req, res) => {
    const video = db.prepare('SELECT * FROM videos WHERE id = ?').get(req.params.id);
    if (!video) return res.redirect('/videos?err=Vídeo+não+encontrado.');

    const filePath = path.resolve(process.env.VIDEOS_PATH || './uploads', video.filename);
    try { fs.unlinkSync(filePath); } catch (e) { console.warn('Aviso: não foi possível remover arquivo:', filePath, e.message); }

    if (video.thumb) {
        const thumbPath = path.resolve(THUMBS_PATH, video.thumb);
        try { fs.unlinkSync(thumbPath); } catch { /* já removido */ }
    }

    db.prepare('DELETE FROM videos WHERE id = ?').run(video.id);
    res.redirect('/videos?msg=Vídeo+removido.');
});

module.exports = router;
