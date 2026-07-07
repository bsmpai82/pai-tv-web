const db = require('../db/database');

function requireAuth(req, res, next) {
    if (!req.session || !req.session.userId) {
        return res.redirect('/login');
    }
    const user = db.prepare('SELECT id, username, role, email, ativo, must_change_password FROM users WHERE id = ?').get(req.session.userId);
    if (!user || !user.ativo) {
        req.session.destroy();
        return res.redirect('/login');
    }
    // Troca de senha obrigatória: bloqueia o painel até o usuário definir a nova senha
    if (user.must_change_password && !req.originalUrl.startsWith('/trocar-senha')) {
        return res.redirect('/trocar-senha');
    }
    req.user = user;
    res.locals.user = user;
    next();
}

module.exports = requireAuth;
