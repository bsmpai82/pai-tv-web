const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const db = require('../db/database');
const { log } = require('../services/logger');

const router = express.Router();

const MAX_SIZE_BYTES = 20 * 1024 * 1024; // 20 MB
const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp'];

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
        if (ALLOWED_MIME.includes(file.mimetype)) return cb(null, true);
        cb(new Error('Apenas arquivos JPEG, PNG ou WebP são aceitos.'));
    },
});

// Listagem — usuário comum vê apenas suas próprias imagens
router.get('/', (req, res) => {
    const isUser = req.user.role === 'user';
    const query = isUser
        ? `SELECT i.*, u.username AS owner_name, COUNT(pi.id) AS playlist_count
           FROM images i
           LEFT JOIN playlist_items pi ON pi.media_type = 'image' AND pi.media_id = i.id
           LEFT JOIN users u ON u.id = i.owner_id
           WHERE i.owner_id = ?
           GROUP BY i.id
           ORDER BY i.created_at DESC`
        : `SELECT i.*, u.username AS owner_name, COUNT(pi.id) AS playlist_count
           FROM images i
           LEFT JOIN playlist_items pi ON pi.media_type = 'image' AND pi.media_id = i.id
           LEFT JOIN users u ON u.id = i.owner_id
           GROUP BY i.id
           ORDER BY i.created_at DESC`;

    const images = isUser
        ? db.prepare(query).all(req.user.id)
        : db.prepare(query).all();

    res.render('images', { images, message: req.query.msg || null, error: req.query.err || null });
});

// Upload — registra o dono da imagem
router.post('/upload', (req, res) => {
    upload.single('image')(req, res, (err) => {
        if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
            return res.redirect('/images?err=Arquivo+muito+grande+%28máx+20+MB%29.');
        }
        if (err) {
            return res.redirect('/images?err=' + encodeURIComponent(err.message));
        }
        if (!req.file) {
            return res.redirect('/images?err=Nenhum+arquivo+enviado.');
        }

        const originalName = Buffer.from(req.file.originalname, 'latin1').toString('utf8');

        db.prepare(`
            INSERT INTO images (filename, original_name, size, owner_id)
            VALUES (?, ?, ?, ?)
        `).run(req.file.filename, originalName, req.file.size, req.user.id);

        log('imagem', `Imagem enviada: ${originalName} (${(req.file.size / 1024 / 1024).toFixed(1)} MB)`);
        res.redirect('/images?msg=Imagem+enviada+com+sucesso.');
    });
});

// Editar duração de exibição (segundos)
router.post('/:id/duration', (req, res) => {
    const image = db.prepare('SELECT * FROM images WHERE id = ?').get(req.params.id);
    if (!image) return res.redirect('/images?err=Imagem+não+encontrada.');

    if (req.user.role === 'user' && image.owner_id !== req.user.id) {
        return res.redirect('/images?err=Sem+permissão+para+editar+esta+imagem.');
    }

    const duration = parseInt(req.body.duration_seconds, 10);
    if (!Number.isInteger(duration) || duration < 1 || duration > 3600) {
        return res.redirect('/images?err=' + encodeURIComponent('Duração inválida (use um valor entre 1 e 3600 segundos).'));
    }

    db.prepare('UPDATE images SET duration_seconds = ? WHERE id = ?').run(duration, image.id);
    log('imagem', `Duração de "${image.original_name}" alterada para ${duration}s`);
    res.redirect('/images?msg=Duração+atualizada.');
});

// Remoção — usuário comum só pode deletar as próprias imagens
router.post('/:id/delete', (req, res) => {
    const image = db.prepare('SELECT * FROM images WHERE id = ?').get(req.params.id);
    if (!image) return res.redirect('/images?err=Imagem+não+encontrada.');

    if (req.user.role === 'user' && image.owner_id !== req.user.id) {
        return res.redirect('/images?err=Sem+permissão+para+remover+esta+imagem.');
    }

    const filePath = path.resolve(process.env.VIDEOS_PATH || './uploads', image.filename);
    try { fs.unlinkSync(filePath); } catch (e) { console.warn('Aviso: não foi possível remover arquivo:', filePath, e.message); }

    db.prepare(`DELETE FROM playlist_items WHERE media_type = 'image' AND media_id = ?`).run(image.id);
    db.prepare('DELETE FROM images WHERE id = ?').run(image.id);

    log('imagem', `Imagem removida: ${image.original_name}`);
    res.redirect('/images?msg=Imagem+removida.');
});

module.exports = router;
