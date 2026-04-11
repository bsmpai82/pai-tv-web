require('dotenv').config();
const express = require('express');
const session = require('express-session');
const path = require('path');
const fs = require('fs');

const db = require('./db/database');
const requireAuth = require('./middleware/requireAuth');
const authRoutes = require('./routes/auth');
const videoRoutes = require('./routes/videos');
const playlistRoutes = require('./routes/playlists');
const deviceRoutes = require('./routes/devices');
const apiRoutes = require('./routes/api');

const app = express();
const PORT = process.env.PORT || 3000;
const VIDEOS_PATH = process.env.VIDEOS_PATH || './uploads';

if (!fs.existsSync(VIDEOS_PATH)) {
    fs.mkdirSync(VIDEOS_PATH, { recursive: true });
}

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/media', express.static(path.resolve(VIDEOS_PATH)));

const THUMBS_PATH = process.env.THUMBS_PATH || '/srv/pai_tv/thumbs';
if (!fs.existsSync(THUMBS_PATH)) fs.mkdirSync(THUMBS_PATH, { recursive: true });
app.use('/thumbs', express.static(path.resolve(THUMBS_PATH)));

app.use(session({
    secret: process.env.SESSION_SECRET || 'pai-tv-secret-change-me',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 8 * 60 * 60 * 1000 } // 8 horas
}));

app.use('/', authRoutes);
app.use('/videos', requireAuth, videoRoutes);
app.use('/playlists', requireAuth, playlistRoutes);
app.use('/devices', requireAuth, deviceRoutes);
app.use('/api', apiRoutes);

app.get('/', requireAuth, (req, res) => {
    const videoCount   = db.prepare('SELECT COUNT(*) AS n FROM videos').get().n;
    const playlistCount = db.prepare('SELECT COUNT(*) AS n FROM playlists').get().n;
    const deviceCount  = db.prepare('SELECT COUNT(*) AS n FROM devices').get().n;
    const pendingCount = db.prepare('SELECT COUNT(*) AS n FROM devices WHERE name IS NULL').get().n;
    res.render('dashboard', { videoCount, playlistCount, deviceCount, pendingCount });
});

app.listen(PORT, () => {
    console.log(`PAI TV rodando em http://localhost:${PORT}`);
});
