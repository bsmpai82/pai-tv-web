const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const requireAuth = require('../middleware/requireAuth');
const settingsStore = require('../services/settingsStore');
const { log } = require('../services/logger');

const RELEASES_PATH = process.env.RELEASES_PATH || './releases';
const APK_FILENAME = 'pai-tv.apk';

if (!fs.existsSync(RELEASES_PATH)) {
    fs.mkdirSync(RELEASES_PATH, { recursive: true });
}

function generateToken() {
    return crypto.randomBytes(6).toString('hex');
}

function ensureApkToken() {
    let token = settingsStore.get('apk_download_token');
    if (!token) {
        token = generateToken();
        settingsStore.set('apk_download_token', token);
        log('apk', 'Token de download do APK gerado automaticamente.');
    }
    return token;
}

function apkFilePath() {
    return path.resolve(RELEASES_PATH, APK_FILENAME);
}

const router = express.Router();

// Upload de novo APK (admin)
const upload = multer({
    storage: multer.diskStorage({
        destination: (req, file, cb) => cb(null, path.resolve(RELEASES_PATH)),
        filename: (req, file, cb) => cb(null, APK_FILENAME),
    }),
    limits: { fileSize: 100 * 1024 * 1024 }, // 100 MB
    fileFilter: (req, file, cb) => {
        if (file.originalname.toLowerCase().endsWith('.apk')) return cb(null, true);
        cb(new Error('Apenas arquivos .apk são aceitos.'));
    },
});

router.post('/upload', requireAuth, (req, res) => {
    upload.single('apk')(req, res, (err) => {
        if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
            return res.redirect('/settings?err=APK+muito+grande+%28máx+100+MB%29.');
        }
        if (err) {
            return res.redirect('/settings?err=' + encodeURIComponent(err.message));
        }
        if (!req.file) {
            return res.redirect('/settings?err=Nenhum+arquivo+enviado.');
        }
        log('apk', `APK atualizado via painel (${(req.file.size / 1024 / 1024).toFixed(1)} MB).`);
        res.redirect('/settings?msg=APK+atualizado+com+sucesso.');
    });
});

// Rotaciona o token — invalida URLs anteriores
router.post('/rotate-token', requireAuth, (req, res) => {
    const novo = generateToken();
    settingsStore.set('apk_download_token', novo);
    log('apk', 'Token de download do APK rotacionado manualmente.', 'warn');
    res.redirect('/settings?msg=Token+rotacionado.+Links+antigos+invalidados.');
});

// Download público protegido por token
// GET /apk/:token
router.get('/:token', (req, res) => {
    const token = settingsStore.get('apk_download_token');
    if (!token || req.params.token !== token) {
        return res.status(404).send('Não encontrado.');
    }

    const apkPath = apkFilePath();
    if (!fs.existsSync(apkPath)) {
        return res.status(404).send('APK indisponível. Faça upload pelo painel administrativo.');
    }

    const ua = (req.get('User-Agent') || 'desconhecido').slice(0, 80);
    const ip = req.ip || 'desconhecido';
    log('apk', `Download do APK (IP: ${ip}, UA: ${ua})`);

    res.setHeader('Content-Type', 'application/vnd.android.package-archive');
    res.setHeader('Content-Disposition', `attachment; filename="${APK_FILENAME}"`);
    res.sendFile(apkPath);
});

module.exports = {
    router,
    ensureApkToken,
    apkFilePath,
    APK_FILENAME,
    RELEASES_PATH,
};
