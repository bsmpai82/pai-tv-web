const db = require('../db/database');
const { sendOfflineAlert, sendOnlineAlert } = require('./mailer');

const OFFLINE_THRESHOLD_MS = 15 * 60 * 1000; // 15 minutos
const CHECK_INTERVAL_MS    =  5 * 60 * 1000; // verifica a cada 5 minutos

async function checkDeviceAlerts() {
    const devices = db.prepare('SELECT * FROM devices WHERE name IS NOT NULL').all();
    const now = Date.now();

    for (const device of devices) {
        const lastSeen = device.last_seen
            ? new Date(device.last_seen.replace(' ', 'T') + 'Z').getTime()
            : null;

        const isOffline = !lastSeen || (now - lastSeen) > OFFLINE_THRESHOLD_MS;

        if (isOffline && !device.offline_alert_sent) {
            console.log(`[Alertas] ${device.name} offline — enviando e-mail.`);
            await sendOfflineAlert(device);
            db.prepare('UPDATE devices SET offline_alert_sent = 1 WHERE id = ?').run(device.id);
        } else if (!isOffline && device.offline_alert_sent) {
            console.log(`[Alertas] ${device.name} voltou online — enviando e-mail.`);
            await sendOnlineAlert(device);
            db.prepare('UPDATE devices SET offline_alert_sent = 0 WHERE id = ?').run(device.id);
        }
    }
}

function startAlertChecker() {
    if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
        console.warn('[Alertas] GMAIL_USER ou GMAIL_APP_PASSWORD não configurados — alertas desativados.');
        return;
    }
    console.log('[Alertas] Verificador de dispositivos iniciado.');
    setInterval(() => {
        checkDeviceAlerts().catch(err => console.error('[Alertas] Erro:', err.message));
    }, CHECK_INTERVAL_MS);
}

module.exports = { startAlertChecker };
