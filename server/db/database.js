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
    `CREATE TABLE IF NOT EXISTS groups (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        name       TEXT    NOT NULL UNIQUE,
        playlist_id INTEGER REFERENCES playlists(id) ON DELETE SET NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
    `ALTER TABLE devices ADD COLUMN group_id INTEGER REFERENCES groups(id) ON DELETE SET NULL`,
];
for (const sql of migrations) {
    try { db.exec(sql); } catch { /* coluna já existe */ }
}

module.exports = db;
