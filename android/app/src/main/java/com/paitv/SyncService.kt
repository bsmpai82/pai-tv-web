package com.paitv

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Intent
import android.os.Build
import android.os.IBinder
import android.util.Log
import androidx.core.app.NotificationCompat
import kotlinx.coroutines.*

class SyncService : Service() {

    companion object {
        const val CHANNEL_ID = "pai_tv_sync"
        const val NOTIFICATION_ID = 1
        const val CHECK_INTERVAL_MS = 5 * 60 * 1000L // 5 minutos
        const val ACTION_PLAYLIST_UPDATED = "com.paitv.PLAYLIST_UPDATED"
    }

    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    private lateinit var prefs: DevicePrefs
    private lateinit var api: ApiClient
    private lateinit var videoManager: VideoManager

    override fun onCreate() {
        super.onCreate()
        prefs = DevicePrefs(this)
        api = ApiClient(BuildConfig.SERVER_URL)
        videoManager = VideoManager(this)
        createNotificationChannel()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        startForeground(NOTIFICATION_ID, buildNotification())

        scope.launch {
            // Registra o dispositivo e obtém/restaura o token de autenticação
            val token = prefs.deviceToken ?: api.register(prefs.deviceUuid)?.also {
                prefs.deviceToken = it
            }
            api.token = token

            // Loop de verificação a cada 5 minutos
            while (isActive) {
                runCatching { checkAndSync() }
                    .onFailure { Log.e("SyncService", "Erro no sync: ${it.message}") }
                delay(CHECK_INTERVAL_MS)
            }
        }

        return START_STICKY
    }

    suspend fun checkAndSync() {
        val uuid = prefs.deviceUuid
        val check = api.check(uuid) ?: return

        api.heartbeat(uuid, BuildConfig.VERSION_NAME, prefs.currentVideo)

        val needsSync = check.forceSync || check.playlistHash != prefs.lastPlaylistHash

        if (!needsSync) return

        Log.i("SyncService", "Sincronizando playlist (force=${check.forceSync})")

        val playlistResp = api.getPlaylist(uuid) ?: return
        val videos = playlistResp.videos

        val changed = videoManager.sync(videos, api)

        // Só salva o hash se todos os vídeos foram baixados com sucesso
        val allCached = videos.all { videoManager.isCached(it.filename) }
        if (allCached) {
            prefs.lastPlaylistHash = check.playlistHash
        } else {
            Log.w("SyncService", "Nem todos os vídeos foram baixados. Hash não salvo — tentará novamente.")
        }

        // Envia apenas os filenames que estão em cache para o player
        val cachedFilenames = videos.map { it.filename }.filter { videoManager.isCached(it) }

        if ((changed || check.forceSync) && cachedFilenames.isNotEmpty()) {
            sendBroadcast(Intent(ACTION_PLAYLIST_UPDATED).apply {
                `package` = packageName
                putStringArrayListExtra("filenames", ArrayList(cachedFilenames))
            })
            Log.i("SyncService", "Sync concluído. ${cachedFilenames.size}/${videos.size} vídeo(s) em cache.")
        }
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onDestroy() {
        scope.cancel()
        super.onDestroy()
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                getString(R.string.notification_channel_name),
                NotificationManager.IMPORTANCE_LOW
            )
            getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
        }
    }

    private fun buildNotification() = NotificationCompat.Builder(this, CHANNEL_ID)
        .setContentTitle(getString(R.string.notification_title))
        .setContentText(getString(R.string.notification_text))
        .setSmallIcon(android.R.drawable.ic_media_play)
        .setPriority(NotificationCompat.PRIORITY_LOW)
        .build()
}
