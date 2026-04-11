const express = require('express');
const bcrypt = require('bcrypt');
const router = express.Router();

router.get('/login', (req, res) => {
    if (req.session.authenticated) return res.redirect('/');
    res.render('login', { error: null });
});

router.post('/login', async (req, res) => {
    const { password } = req.body;
    const hash = process.env.ADMIN_PASSWORD_HASH;

    if (!hash) {
        return res.render('login', { error: 'Servidor não configurado. Execute: npm run setup' });
    }

    try {
        const match = await bcrypt.compare(password, hash);
        if (match) {
            req.session.authenticated = true;
            return res.redirect('/');
        }
        res.render('login', { error: 'Senha incorreta.' });
    } catch {
        res.render('login', { error: 'Erro de autenticação.' });
    }
});

router.post('/logout', (req, res) => {
    req.session.destroy(() => res.redirect('/login'));
});

module.exports = router;
