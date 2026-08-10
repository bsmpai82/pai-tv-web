const express = require('express');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const db = require('../db/database');
const requireAuth = require('../middleware/requireAuth');
const { validatePassword } = require('../services/passwordPolicy');
const router = express.Router();

const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, standardHeaders: true, legacyHeaders: false });

router.get('/login', (req, res) => {
    if (req.session.userId) return res.redirect('/');
    res.render('login', { error: null });
});

router.post('/login', loginLimiter, async (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.render('login', { error: 'Usuário e senha são obrigatórios.' });
    }

    const user = db.prepare('SELECT * FROM users WHERE username = ? AND ativo = 1').get(username.trim());
    if (!user) {
        return res.render('login', { error: 'Usuário ou senha incorretos.' });
    }

    try {
        const match = await bcrypt.compare(password, user.password_hash);
        if (match) {
            req.session.userId = user.id;
            return res.redirect(user.must_change_password ? '/trocar-senha' : '/');
        }
        res.render('login', { error: 'Usuário ou senha incorretos.' });
    } catch {
        res.render('login', { error: 'Erro de autenticação.' });
    }
});

router.post('/logout', (req, res) => {
    req.session.destroy(() => res.redirect('/login'));
});

// Troca de senha obrigatória (flag must_change_password marcada por admin/master)
router.get('/trocar-senha', requireAuth, (req, res) => {
    res.render('trocar-senha', { title: 'Trocar senha', error: req.query.err || null });
});

router.post('/trocar-senha', requireAuth, async (req, res) => {
    const { currentPassword, password } = req.body;

    const user = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(req.user.id);
    const confirmado = currentPassword && await bcrypt.compare(currentPassword, user.password_hash);
    if (!confirmado) {
        return res.redirect('/trocar-senha?err=' + encodeURIComponent('Senha atual incorreta.'));
    }
    const passwordError = validatePassword(password);
    if (passwordError) {
        return res.redirect('/trocar-senha?err=' + encodeURIComponent(passwordError));
    }
    const hash = await bcrypt.hash(password, 10);
    db.prepare('UPDATE users SET password_hash = ?, password_changed_at = CURRENT_TIMESTAMP, must_change_password = 0 WHERE id = ?')
        .run(hash, req.user.id);
    res.redirect('/');
});

module.exports = router;
