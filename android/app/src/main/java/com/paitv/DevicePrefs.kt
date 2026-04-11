package com.paitv

import android.content.Context
import java.util.UUID

class DevicePrefs(context: Context) {

    private val prefs = context.getSharedPreferences("pai_tv", Context.MODE_PRIVATE)

    /** UUID único e persistente do dispositivo. Gerado na primeira execução. */
    val deviceUuid: String
        get() = prefs.getString("device_uuid", null) ?: UUID.randomUUID().toString().also {
            prefs.edit().putString("device_uuid", it).apply()
        }

    /** Hash da playlist local (usado para detectar mudanças). */
    var lastPlaylistHash: String?
        get() = prefs.getString("playlist_hash", null)
        set(value) = prefs.edit().putString("playlist_hash", value).apply()

    /** Lista de filenames atualmente em cache (JSON array simples). */
    var cachedFilenames: Set<String>
        get() = prefs.getStringSet("cached_files", emptySet()) ?: emptySet()
        set(value) = prefs.edit().putStringSet("cached_files", value).apply()
}
