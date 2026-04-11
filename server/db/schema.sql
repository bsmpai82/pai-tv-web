CREATE TABLE IF NOT EXISTS videos (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    filename      TEXT    NOT NULL UNIQUE,
    original_name TEXT    NOT NULL,
    size          INTEGER NOT NULL,
    created_at    DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS playlists (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT    NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS playlist_videos (
    playlist_id INTEGER NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
    video_id    INTEGER NOT NULL REFERENCES videos(id)    ON DELETE CASCADE,
    position    INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (playlist_id, video_id)
);

CREATE TABLE IF NOT EXISTS devices (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    device_uuid TEXT    UNIQUE NOT NULL,
    name        TEXT,
    playlist_id INTEGER REFERENCES playlists(id) ON DELETE SET NULL,
    force_sync  INTEGER NOT NULL DEFAULT 0,
    last_seen   DATETIME,
    registered_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
