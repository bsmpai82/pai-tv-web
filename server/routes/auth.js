const express = require('express');
const bcrypt = require('bcrypt');
const db = require('../db/database');
const router = express.Router();

router.get('/login', (req, res) => {
    if (req.session.userId) return res.redirect('/');
    res.render('login', { error: null });
});

router.post('/login', async (req, res) => {
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
            return res.redirect('/');
        }
        res.render('login', { error: 'Usuário ou senha incorretos.' });
    } catch {
        res.render('login', { error: 'Erro de autenticação.' });
    }
});

router.post('/logout', (req, res) => {
    req.session.destroy(() => res.redirect('/login'));
});

module.exports = router;
