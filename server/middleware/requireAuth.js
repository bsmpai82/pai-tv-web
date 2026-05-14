const db = require('../db/database');

function requireAuth(req, res, next) {
    if (!req.session || !req.session.userId) {
        return res.redirect('/login');
    }
    const user = db.prepare('SELECT id, username, role, email, ativo FROM users WHERE id = ?').get(req.session.userId);
    if (!user || !user.ativo) {
        req.session.destroy();
        return res.redirect('/login');
    }
    req.user = user;
    res.locals.user = user;
    next();
}

module.exports = requireAuth;
