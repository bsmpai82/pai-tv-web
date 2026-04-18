const db = require('../db/database');

function requireDeviceToken(req, res, next) {
    const authHeader = req.headers['authorization'] || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;

    if (!token) {
        return res.status(401).json({ error: 'Token de autenticação ausente.' });
    }

    const device = db.prepare('SELECT * FROM devices WHERE token = ?').get(token);
    if (!device) {
        return res.status(401).json({ error: 'Token inválido.' });
    }

    req.device = device;
    next();
}

module.exports = requireDeviceToken;
