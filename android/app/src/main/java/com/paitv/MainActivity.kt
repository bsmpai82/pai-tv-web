package com.paitv

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.net.Uri
import android.os.Bundle
import android.util.Log
import android.view.WindowManager
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.isVisible
import androidx.media3.common.MediaItem
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.ui.AspectRatioFrameLayout
import com.google.gson.Gson
import com.google.gson.reflect.TypeToken
import com.paitv.databinding.ActivityMainBinding

class MainActivity : AppCompatActivity() {

    companion object {
        private const val TAG = "PaiTV"
        @Volatile var isInForeground = false
    }

    private lateinit var binding: ActivityMainBinding
    private lateinit var prefs: DevicePrefs
    private lateinit var videoManager: VideoManager
    private var player: ExoPlayer? = null
    private var currentItems: List<PlaylistItem> = emptyList()

    private val gson = Gson()
    private val itemsListType = object : TypeToken<List<PlaylistItem>>() {}.type

    private val playlistReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) {
            val json = intent.getStringExtra(SyncService.EXTRA_ITEMS_JSON) ?: return
            val items: List<PlaylistItem> = runCatching {
                gson.fromJson<List<PlaylistItem>>(json, itemsListType)
            }.getOrNull() ?: return
            loadPlayer(items)
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)

        // Mantém a tela sempre ligada
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)

        prefs = DevicePrefs(this)
        videoManager = VideoManager(this)

        // Inicia o serviço de sincronização
        startForegroundService(Intent(this, SyncService::class.java))

        // Carrega itens em cache (se houver)
        val cachedItems = prefs.cachedItems
        if (cachedItems.isNotEmpty()) {
            loadPlayer(cachedItems)
        } else {
            showWaiting()
        }
    }

    override fun onResume() {
        super.onResume()
        isInForeground = true
        registerReceiver(
            playlistReceiver,
            IntentFilter(SyncService.ACTION_PLAYLIST_UPDATED),
            RECEIVER_NOT_EXPORTED
        )
        player?.play()
    }

    override fun onPause() {
        super.onPause()
        isInForeground = false
        unregisterReceiver(playlistReceiver)
        player?.pause()
    }

    override fun onDestroy() {
        player?.release()
        player = null
        super.onDestroy()
    }

    /** Imagem preenche a tela (crop central); vídeo mantém a proporção original (como hoje). */
    private fun resizeModeFor(item: PlaylistItem?): Int =
        if (item?.type == "image") AspectRatioFrameLayout.RESIZE_MODE_ZOOM
        else AspectRatioFrameLayout.RESIZE_MODE_FIT

    private fun loadPlayer(items: List<PlaylistItem>) {
        if (items.isEmpty()) { showWaiting(); return }

        val pairs = items.mapNotNull { item ->
            val file = videoManager.localFile(item.filename)
            if (file.exists()) item to file else null
        }
        if (pairs.isEmpty()) { showWaiting(); return }

        // Salva lista em prefs para próxima abertura do app
        currentItems = pairs.map { it.first }
        prefs.cachedItems = currentItems

        binding.waitingLayout.isVisible = false
        binding.playerView.isVisible = true

        player?.release()
        player = ExoPlayer.Builder(this).build().also { exo ->
            binding.playerView.player = exo
            binding.playerView.useController = false
            binding.playerView.resizeMode = resizeModeFor(pairs.firstOrNull()?.first)

            val mediaItems = pairs.map { (item, file) ->
                if (item.type == "image") {
                    MediaItem.Builder()
                        .setUri(Uri.fromFile(file))
                        .setImageDurationMs((item.durationSeconds ?: 10).toLong() * 1000L)
                        .build()
                } else {
                    MediaItem.fromUri(Uri.fromFile(file))
                }
            }
            exo.setMediaItems(mediaItems)
            exo.repeatMode = Player.REPEAT_MODE_ALL
            exo.playWhenReady = true
            exo.prepare()

            exo.addListener(object : Player.Listener {
                override fun onMediaItemTransition(mediaItem: MediaItem?, reason: Int) {
                    val index = exo.currentMediaItemIndex
                    val current = if (index < currentItems.size) currentItems[index] else null
                    prefs.currentVideo = current?.filename
                    binding.playerView.resizeMode = resizeModeFor(current)
                }

                override fun onPlayerError(error: PlaybackException) {
                    val index = exo.currentMediaItemIndex
                    val filename = if (index < currentItems.size) currentItems[index].filename else "desconhecido"
                    Log.e(TAG, "Erro ao reproduzir '$filename': ${error.message}", error)

                    if (exo.mediaItemCount > 1) {
                        exo.seekToNextMediaItem()
                        exo.prepare()
                        exo.play()
                    }
                }
            })
            // Salva o primeiro item imediatamente
            prefs.currentVideo = currentItems.firstOrNull()?.filename
        }
    }

    private fun showWaiting() {
        player?.release()
        player = null
        binding.playerView.isVisible = false
        binding.waitingLayout.isVisible = true
    }
}
