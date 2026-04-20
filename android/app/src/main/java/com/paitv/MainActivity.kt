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
import com.paitv.databinding.ActivityMainBinding
import java.io.File

class MainActivity : AppCompatActivity() {

    companion object {
        private const val TAG = "PaiTV"
    }

    private lateinit var binding: ActivityMainBinding
    private lateinit var prefs: DevicePrefs
    private lateinit var videoManager: VideoManager
    private var player: ExoPlayer? = null
    private var currentFilenames: List<String> = emptyList()

    private val playlistReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) {
            val filenames = intent.getStringArrayListExtra("filenames") ?: return
            loadPlayer(filenames)
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

        // Carrega vídeos em cache (se houver)
        val cached = videoManager.cachedFiles(prefs.cachedFilenames.toList())
        if (cached.isNotEmpty()) {
            loadPlayer(prefs.cachedFilenames.toList())
        } else {
            showWaiting()
        }
    }

    override fun onResume() {
        super.onResume()
        registerReceiver(
            playlistReceiver,
            IntentFilter(SyncService.ACTION_PLAYLIST_UPDATED),
            RECEIVER_NOT_EXPORTED
        )
        player?.play()
    }

    override fun onPause() {
        super.onPause()
        unregisterReceiver(playlistReceiver)
        player?.pause()
    }

    override fun onDestroy() {
        player?.release()
        player = null
        super.onDestroy()
    }

    private fun loadPlayer(filenames: List<String>) {
        if (filenames.isEmpty()) { showWaiting(); return }

        val files = videoManager.cachedFiles(filenames)
        if (files.isEmpty()) { showWaiting(); return }

        // Salva lista em prefs para próxima abertura do app
        currentFilenames = filenames
        prefs.cachedFilenames = filenames.toSet()

        binding.waitingLayout.isVisible = false
        binding.playerView.isVisible = true

        player?.release()
        player = ExoPlayer.Builder(this).build().also { exo ->
            binding.playerView.player = exo
            binding.playerView.useController = false

            val items = files.map { MediaItem.fromUri(Uri.fromFile(it)) }
            exo.setMediaItems(items)
            exo.repeatMode = Player.REPEAT_MODE_ALL
            exo.playWhenReady = true
            exo.prepare()

            exo.addListener(object : Player.Listener {
                override fun onMediaItemTransition(mediaItem: MediaItem?, reason: Int) {
                    val index = exo.currentMediaItemIndex
                    prefs.currentVideo = if (index < filenames.size) filenames[index] else null
                }

                override fun onPlayerError(error: PlaybackException) {
                    val index = exo.currentMediaItemIndex
                    val filename = if (index < currentFilenames.size) currentFilenames[index] else "desconhecido"
                    Log.e(TAG, "Erro ao reproduzir '$filename': ${error.message}", error)

                    if (exo.mediaItemCount > 1) {
                        exo.seekToNextMediaItem()
                        exo.prepare()
                        exo.play()
                    }
                }
            })
            // Salva o primeiro vídeo imediatamente
            prefs.currentVideo = filenames.firstOrNull()
        }
    }

    private fun showWaiting() {
        player?.release()
        player = null
        binding.playerView.isVisible = false
        binding.waitingLayout.isVisible = true
    }
}
