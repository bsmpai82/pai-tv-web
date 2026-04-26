package com.paitv

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Intent
import android.net.wifi.WifiManager
import android.os.Build
import android.os.IBinder
import android.util.Log
import androidx.core.app.NotificationCompat
import kotlinx.coroutines.*
import java.net.InetAddress

class SyncService : Service() {

    companion object {
        const val CHANNEL_ID = "pai_tv_sync"
        const val NOTIFICATION_ID = 1
        const val CHECK_INTERVAL_MS = 5 * 60 * 1000L // 5 minutos
        const val ACTION_PLAYLIST_UPDATED = "com.paitv.PLAYLIST_UPDATED"
        const val EXTRA_LAUNCH_UI = "launch_ui"
        // Atraso para dar tempo do sistema terminar o boot antes de lançar
        // a activity. Sem isso, alguns OEMs (Intelbras, Xiaomi) descartam
        // a chamada.
        private const val BOOT_LAUNCH_DELAY_MS = 4_000L
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

        // Acionado pelo BootReceiver: precisa trazer a UI à frente. Foreground
        // services têm permissão de startActivity em background no Android 10+.
        if (intent?.getBooleanExtra(EXTRA_LAUNCH_UI, false) == true) {
            scope.launch {
                delay(BOOT_LAUNCH_DELAY_MS)
                launchMainActivity()
            }
        }

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

        val localIp = getLocalIpAddress()
        api.heartbeat(uuid, BuildConfig.VERSION_NAME, prefs.currentVideo, localIp)

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

    private fun launchMainActivity() {
        try {
            val launch = Intent(this, MainActivity::class.java).apply {
                addFlags(
                    Intent.FLAG_ACTIVITY_NEW_TASK or
                        Intent.FLAG_ACTIVITY_CLEAR_TOP or
                        Intent.FLAG_ACTIVITY_RESET_TASK_IF_NEEDED
                )
            }
            startActivity(launch)
            Log.i("SyncService", "MainActivity lançada após boot")
        } catch (e: Exception) {
            Log.e("SyncService", "Falha ao lançar MainActivity: ${e.message}")
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

    private fun getLocalIpAddress(): String? = runCatching {
        val wifiMgr = getSystemService(android.content.Context.WIFI_SERVICE) as? WifiManager
        val connectionInfo = wifiMgr?.connectionInfo ?: return@runCatching null
        val ipAddress = connectionInfo.ipAddress
        // Converte do inteiro little-endian para notação decimal
        if (ipAddress == 0) return@runCatching null
        String.format("%d.%d.%d.%d", 
            ipAddress and 0xff,
            ipAddress shr 8 and 0xff,
            ipAddress shr 16 and 0xff,
            ipAddress shr 24 and 0xff
        )
    }.getOrNull()

    private fun buildNotification() = NotificationCompat.Builder(this, CHANNEL_ID)
        .setContentTitle(getString(R.string.notification_title))
        .setContentText(getString(R.string.notification_text))
        .setSmallIcon(android.R.drawable.ic_media_play)
        .setPriority(NotificationCompat.PRIORITY_LOW)
        .build()
}
