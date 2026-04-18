const nodemailer = require('nodemailer');
const db = require('../db/database');

function createTransport() {
    return nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: process.env.GMAIL_USER,
            pass: process.env.GMAIL_APP_PASSWORD,
        },
    });
}

function getRecipientsForDevice(deviceId) {
    return db.prepare(`
        SELECT e.email FROM alert_emails e
        WHERE e.ativo = 1 AND (
            e.scope = 'all'
            OR (e.scope = 'specific' AND EXISTS (
                SELECT 1 FROM alert_email_devices aed
                WHERE aed.email_id = e.id AND aed.device_id = ?
            ))
        )
    `).all(deviceId).map(r => r.email);
}

async function sendOfflineAlert(device) {
    const recipients = getRecipientsForDevice(device.id);
    if (!recipients.length || !process.env.GMAIL_USER) return;

    const transporter = createTransport();
    await transporter.sendMail({
        from: `"PAI TV" <${process.env.GMAIL_USER}>`,
        to: recipients.join(', '),
        subject: `⚠️ Dispositivo offline: ${device.name}`,
        html: `
            <h2>⚠️ Dispositivo offline</h2>
            <p>O dispositivo <strong>${device.name}</strong> está offline há mais de 15 minutos.</p>
            <p><strong>Última conexão:</strong> ${device.last_seen || 'Nunca'}</p>
            <p>Acesse o painel em <a href="https://paitv.com.br">paitv.com.br</a> para verificar.</p>
        `,
    }).catch(err => console.error('[Mailer] Erro ao enviar alerta offline:', err.message));
}

async function sendOnlineAlert(device) {
    const recipients = getRecipientsForDevice(device.id);
    if (!recipients.length || !process.env.GMAIL_USER) return;

    const transporter = createTransport();
    await transporter.sendMail({
        from: `"PAI TV" <${process.env.GMAIL_USER}>`,
        to: recipients.join(', '),
        subject: `✅ Dispositivo online: ${device.name}`,
        html: `
            <h2>✅ Dispositivo voltou online</h2>
            <p>O dispositivo <strong>${device.name}</strong> voltou a se comunicar com o servidor.</p>
            <p>Acesse o painel em <a href="https://paitv.com.br">paitv.com.br</a> para verificar.</p>
        `,
    }).catch(err => console.error('[Mailer] Erro ao enviar alerta online:', err.message));
}

module.exports = { sendOfflineAlert, sendOnlineAlert };
