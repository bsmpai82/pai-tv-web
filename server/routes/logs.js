const express = require('express');
const db = require('../db/database');

const router = express.Router();

router.get('/', (req, res) => {
    const tipo  = req.query.tipo  || '';
    const nivel = req.query.nivel || '';
    const limit = 200;

    let where = 'WHERE 1=1';
    const params = [];
    if (tipo)  { where += ' AND l.tipo = ?';  params.push(tipo); }
    if (nivel) { where += ' AND l.nivel = ?'; params.push(nivel); }

    const logs = db.prepare(`
        SELECT l.*, d.name AS device_name
        FROM logs l
        LEFT JOIN devices d ON d.id = l.device_id
        ${where}
        ORDER BY l.created_at DESC
        LIMIT ${limit}
    `).all(...params);

    res.render('logs', { logs, tipo, nivel });
});

router.post('/limpar', (req, res) => {
    db.prepare('DELETE FROM logs').run();
    res.redirect('/logs?msg=Logs+limpos.');
});

module.exports = router;
