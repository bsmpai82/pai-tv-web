require('dotenv').config();

if (!process.env.SESSION_SECRET) {
    console.error('FATAL: SESSION_SECRET não definido no .env');
    process.exit(1);
}

const express = require('express');
const session = require('express-session');
const helmet = require('helmet');
const path = require('path');
const fs = require('fs');

const db = require('./db/database');
const requireAuth = require('./middleware/requireAuth');
const requireRole = require('./middleware/requireRole');
const authRoutes = require('./routes/auth');
const videoRoutes = require('./routes/videos');
const playlistRoutes = require('./routes/playlists');
const deviceRoutes = require('./routes/devices');
const groupRoutes = require('./routes/groups');
const settingsRoutes = require('./routes/settings');
const logsRoutes = require('./routes/logs');
const usersRoutes = require('./routes/users');
const apiRoutes = require('./routes/api');
const { router: apkRoutes, ensureApkToken } = require('./routes/apk');
const { startAlertChecker } = require('./services/alertChecker');

const app = express();
const PORT = process.env.PORT || 3000;
// Ambiente atual (ex: 'homolog') — disponível em todas as views
app.locals.appEnv = process.env.APP_ENV || '';
const VIDEOS_PATH = process.env.VIDEOS_PATH || './uploads';

if (!fs.existsSync(VIDEOS_PATH)) {
    fs.mkdirSync(VIDEOS_PATH, { recursive: true });
}

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
// Necessário para req.protocol retornar 'https' atrás do Caddy
app.set('trust proxy', 1);

app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/media', express.static(path.resolve(VIDEOS_PATH)));

const THUMBS_PATH = process.env.THUMBS_PATH || '/srv/pai_tv/thumbs';
if (!fs.existsSync(THUMBS_PATH)) fs.mkdirSync(THUMBS_PATH, { recursive: true });
app.use('/thumbs', express.static(path.resolve(THUMBS_PATH)));

app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 8 * 60 * 60 * 1000, sameSite: 'lax', httpOnly: true, secure: true } // 8 horas
}));

app.use('/', authRoutes);
app.use('/videos', requireAuth, videoRoutes);
app.use('/playlists', requireAuth, playlistRoutes);
app.use('/devices', requireAuth, deviceRoutes);
// Grupos, logs, configurações — apenas master e admin
app.use('/groups', requireAuth, requireRole('master', 'admin'), groupRoutes);
app.use('/settings', requireAuth, requireRole('master', 'admin'), settingsRoutes);
app.use('/logs', requireAuth, requireRole('master', 'admin'), logsRoutes);
// Gerenciamento de usuários — master e admin
app.use('/users', requireAuth, usersRoutes);
app.use('/api', apiRoutes);
app.use('/apk', apkRoutes);

app.get('/', requireAuth, (req, res) => {
    const isUser = req.user.role === 'user';

    const videoCount    = isUser
        ? db.prepare('SELECT COUNT(*) AS n FROM videos WHERE owner_id = ?').get(req.user.id).n
        : db.prepare('SELECT COUNT(*) AS n FROM videos').get().n;
    const playlistCount = isUser
        ? db.prepare('SELECT COUNT(*) AS n FROM playlists WHERE owner_id = ?').get(req.user.id).n
        : db.prepare('SELECT COUNT(*) AS n FROM playlists').get().n;
    const deviceCount   = isUser
        ? db.prepare('SELECT COUNT(*) AS n FROM user_devices WHERE user_id = ?').get(req.user.id).n
        : db.prepare('SELECT COUNT(*) AS n FROM devices').get().n;
    const groupCount    = isUser ? 0 : db.prepare('SELECT COUNT(*) AS n FROM groups').get().n;
    const pendingCount  = isUser ? 0 : db.prepare('SELECT COUNT(*) AS n FROM devices WHERE name IS NULL').get().n;

    // Lista de dispositivos com status online/offline
    const devicesQuery = isUser
        ? `SELECT d.name, d.last_seen FROM devices d
           JOIN user_devices ud ON ud.device_id = d.id AND ud.user_id = ?
           WHERE d.name IS NOT NULL ORDER BY d.name ASC`
        : `SELECT d.name, d.last_seen FROM devices d WHERE d.name IS NOT NULL ORDER BY d.name ASC`;

    const devices = isUser
        ? db.prepare(devicesQuery).all(req.user.id)
        : db.prepare(devicesQuery).all();

    const now = Date.now();
    devices.forEach(d => {
        d.is_online = d.last_seen
            ? (now - new Date(d.last_seen.replace(' ', 'T') + 'Z').getTime()) < 10 * 60 * 1000
            : false;
    });

    const offlineDevices = isUser ? [] : db.prepare(`
        SELECT name FROM devices
        WHERE name IS NOT NULL
          AND (
            last_seen IS NULL
            OR (strftime('%s','now') - strftime('%s', last_seen)) > 3600
          )
        ORDER BY name ASC
    `).all();

    res.render('dashboard', { videoCount, playlistCount, deviceCount, groupCount, pendingCount, devices, offlineDevices });
});

app.listen(PORT, () => {
    console.log(`PAI TV rodando em http://localhost:${PORT}`);
    ensureApkToken();
    startAlertChecker();
});
