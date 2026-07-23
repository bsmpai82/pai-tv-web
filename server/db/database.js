const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dbPath = process.env.DB_PATH || './db/pai_tv.db';
const dbDir = path.dirname(path.resolve(dbPath));

if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
}

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
db.exec(schema);

// Migrações — adiciona colunas novas sem recriar o banco
const migrations = [
    `ALTER TABLE devices ADD COLUMN app_version TEXT`,
    `ALTER TABLE devices ADD COLUMN current_video TEXT`,
    `ALTER TABLE videos ADD COLUMN thumb TEXT`,
    `ALTER TABLE devices ADD COLUMN local_ip TEXT`,
    `CREATE TABLE IF NOT EXISTS groups (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        name       TEXT    NOT NULL UNIQUE,
        playlist_id INTEGER REFERENCES playlists(id) ON DELETE SET NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
    `ALTER TABLE devices ADD COLUMN group_id INTEGER REFERENCES groups(id) ON DELETE SET NULL`,
    `ALTER TABLE devices ADD COLUMN token TEXT`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_devices_token ON devices(token)`,
    `ALTER TABLE devices ADD COLUMN offline_alert_sent INTEGER DEFAULT 0`,
    `CREATE TABLE IF NOT EXISTS alert_emails (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        email      TEXT    NOT NULL UNIQUE,
        ativo      INTEGER NOT NULL DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS logs (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        tipo       TEXT NOT NULL,
        nivel      TEXT NOT NULL DEFAULT 'info',
        mensagem   TEXT NOT NULL,
        device_id  INTEGER REFERENCES devices(id) ON DELETE SET NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
    `ALTER TABLE alert_emails ADD COLUMN scope TEXT NOT NULL DEFAULT 'all'`,
    `CREATE TABLE IF NOT EXISTS alert_email_devices (
        email_id  INTEGER NOT NULL REFERENCES alert_emails(id) ON DELETE CASCADE,
        device_id INTEGER NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
        PRIMARY KEY (email_id, device_id)
    )`,
    `CREATE TABLE IF NOT EXISTS settings (
        key        TEXT PRIMARY KEY,
        value      TEXT NOT NULL,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS users (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        username      TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        email         TEXT,
        role          TEXT NOT NULL DEFAULT 'user',
        ativo         INTEGER NOT NULL DEFAULT 1,
        created_at    DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS user_devices (
        user_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        device_id INTEGER NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
        PRIMARY KEY (user_id, device_id)
    )`,
    `ALTER TABLE videos ADD COLUMN owner_id INTEGER REFERENCES users(id) ON DELETE SET NULL`,
    `ALTER TABLE playlists ADD COLUMN owner_id INTEGER REFERENCES users(id) ON DELETE SET NULL`,
    `ALTER TABLE users ADD COLUMN password_changed_at DATETIME`,
    `ALTER TABLE users ADD COLUMN must_change_password INTEGER NOT NULL DEFAULT 0`,
    `CREATE TABLE IF NOT EXISTS images (
        id               INTEGER PRIMARY KEY AUTOINCREMENT,
        filename         TEXT    NOT NULL UNIQUE,
        original_name    TEXT    NOT NULL,
        size             INTEGER NOT NULL,
        duration_seconds INTEGER NOT NULL DEFAULT 10,
        owner_id         INTEGER REFERENCES users(id) ON DELETE SET NULL,
        created_at       DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS playlist_items (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        playlist_id INTEGER NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
        media_type  TEXT    NOT NULL CHECK(media_type IN ('video','image')),
        media_id    INTEGER NOT NULL,
        position    INTEGER NOT NULL DEFAULT 0
    )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_playlist_items_unique ON playlist_items(playlist_id, media_type, media_id)`,
    `CREATE INDEX IF NOT EXISTS idx_playlist_items_playlist ON playlist_items(playlist_id)`,
    `INSERT INTO playlist_items (playlist_id, media_type, media_id, position)
     SELECT playlist_id, 'video', video_id, position FROM playlist_videos
     WHERE NOT EXISTS (SELECT 1 FROM playlist_items)`,
];
for (const sql of migrations) {
    try { db.exec(sql); } catch { /* coluna já existe */ }
}

module.exports = db;
