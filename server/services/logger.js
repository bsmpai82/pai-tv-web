const db = require('../db/database');

function log(tipo, mensagem, nivel = 'info', device_id = null) {
    try {
        db.prepare(`
            INSERT INTO logs (tipo, nivel, mensagem, device_id)
            VALUES (?, ?, ?, ?)
        `).run(tipo, nivel, mensagem, device_id);
    } catch (e) {
        console.error('[Logger] Erro ao salvar log:', e.message);
    }
}

module.exports = { log };
