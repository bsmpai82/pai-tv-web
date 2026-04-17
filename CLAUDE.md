# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**PAI TV** is a LAN-only institutional video distribution system for Fire TV Sticks. An admin panel (Node.js/Express) manages videos and playlists; Android apps on Fire Sticks poll every 5 minutes, download changed content, and play in a loop.

## Commands

### Server (Node.js)
```bash
cd server
npm run dev        # Development with nodemon auto-reload
npm start          # Production start
node setup.js      # Interactive setup — sets ADMIN_PASSWORD_HASH in .env
```

### Android App
Build via Android Studio: **Build > Build APK(s)**  
Output: `android/app/build/outputs/apk/debug/app-debug.apk`

Deploy to Fire Stick via ADB:
```bash
adb connect {stick_ip}:5555
adb install -r pai-tv.apk
# Or batch deploy:
bash deploy/instalar-firestick.sh 192.168.1.50 192.168.1.51 ...
```

### Server Deployment (Ubuntu 24.04)
```bash
sudo bash deploy/setup-ubuntu.sh   # One-time install: Node.js 20, systemd service, dirs
sudo systemctl start pai-tv
sudo systemctl status pai-tv
```

## Architecture

### System Flow
```
Browser (Admin)
  ↕ HTTP/EJS
Express Server (Ubuntu /opt/pai-tv/)
  ↕ better-sqlite3
SQLite DB (/srv/pai_tv/pai_tv.db)

Fire Stick → polls GET /api/device/{uuid}/check every 5 min
           → if hash changed: GET /api/device/{uuid}/playlist
           → downloads missing videos via GET /media/{filename}
           → ExoPlayer plays loop from local cache
```

### Server Structure (`server/`)
- **`server.js`** — Express app entry; mounts routes, sets up sessions, serves `/media` as static
- **`db/database.js`** — SQLite connection + migrations (ALTER TABLE when adding columns)
- **`db/schema.sql`** — Canonical schema for: `videos`, `playlists`, `playlist_videos`, `devices`, `groups`
- **`routes/api.js`** — Fire Stick REST API (no auth; trusted LAN assumed)
- **`routes/videos.js`** — Upload (Multer + ffmpeg thumbnail + ffprobe bitrate check), delete
- **`routes/devices.js`** — Device naming, playlist assignment, force sync trigger
- **`routes/groups.js`** — Group CRUD; devices inherit playlist from group if not directly assigned
- **`middleware/requireAuth.js`** — Session guard for all admin routes
- **`views/`** — EJS templates rendered server-side (no JS framework)

### Android Structure (`android/app/src/main/java/com/paitv/`)
- **`SyncService.kt`** — Foreground service; polls every 5 min, calls `VideoManager.sync()`
- **`VideoManager.kt`** — Downloads/removes files in `context.filesDir/videos/`; compares by file size
- **`ApiClient.kt`** — OkHttp wrapper; sends device UUID header on every request
- **`MainActivity.kt`** — Fullscreen ExoPlayer; listens for `ACTION_PLAYLIST_UPDATED` broadcast
- **`DevicePrefs.kt`** — SharedPreferences: stores `device_uuid`, `playlist_hash`, `cached_files`
- **`BootReceiver.kt`** — Starts MainActivity + SyncService on device reboot

## Key Patterns

### Playlist Inheritance (Groups)
When resolving a device's effective playlist, query both `devices.playlist_id` and `groups.playlist_id` (via `devices.group_id`). Device-level assignment takes precedence. See `routes/api.js` for the JOIN query.

### Change Detection
Server computes an MD5 hash of the playlist's filenames in order. Device caches this hash in `DevicePrefs`. On check, if hash differs → full sync; if `force_sync = 1` → also full sync (reset after sync).

### Video Upload Constraints
- MIME must be `video/mp4`; max 2 GB
- ffprobe enforces ≤ 8 Mbps bitrate
- ffmpeg generates a JPEG thumbnail at 320px wide
- Stored as `{timestamp}-{random}.mp4` under `/srv/pai_tv/videos/`

### Environment (Server `.env`)
```
PORT=3000
SESSION_SECRET=<long random string>
ADMIN_PASSWORD_HASH=<bcrypt hash from setup.js>
VIDEOS_PATH=/srv/pai_tv/videos
DB_PATH=/srv/pai_tv/pai_tv.db
```

### Android Build Config
Server URL is set as a `BuildConfig` field in `app/build.gradle.kts`. HTTP cleartext is allowed via `res/xml/network_security_config.xml` (LAN-only; no HTTPS required).

## Database Schema Key Points
- `playlist_videos` uses `position` column for video ordering within a playlist
- `devices.force_sync` is set to `1` when admin assigns/changes a playlist; reset after device acknowledges
- `devices.last_seen` is updated on every `/check` and `/heartbeat` call; online = updated within 10 minutes
- Schema migrations live in `db/database.js` as conditional `ALTER TABLE` statements (not in `schema.sql`)
