package com.paitv

import android.content.Context
import android.util.Log
import java.io.File

class VideoManager(context: Context) {

    private val videosDir = File(context.filesDir, "videos").also { it.mkdirs() }

    fun localFile(filename: String): File = File(videosDir, filename)

    fun isCached(filename: String): Boolean = localFile(filename).exists()

    /** Retorna lista de arquivos locais na ordem da playlist. */
    fun cachedFiles(filenames: List<String>): List<File> =
        filenames.map { localFile(it) }.filter { it.exists() }

    /**
     * Sincroniza a pasta local com a playlist do servidor:
     * - Baixa arquivos novos
     * - Remove arquivos que não estão mais na playlist
     * Retorna true se houve alguma mudança.
     */
    fun sync(videos: List<VideoItem>, api: ApiClient): Boolean {
        val serverFilenames = videos.map { it.filename }.toSet()
        var changed = false

        // Remove arquivos não mais na playlist
        videosDir.listFiles()?.forEach { file ->
            if (file.name !in serverFilenames) {
                file.delete()
                Log.i("VideoManager", "Removido: ${file.name}")
                changed = true
            }
        }

        // Baixa arquivos novos
        for (video in videos) {
            val dest = localFile(video.filename)
            if (dest.exists() && dest.length() == video.size) continue // já em cache

            Log.i("VideoManager", "Baixando: ${video.originalName}")
            runCatching {
                api.downloadVideo(video.url, dest) { downloaded, total ->
                    if (total > 0) {
                        val pct = (downloaded * 100 / total).toInt()
                        Log.v("VideoManager", "  ${video.originalName}: $pct%")
                    }
                }
                changed = true
                Log.i("VideoManager", "Concluído: ${video.originalName}")
            }.onFailure { e ->
                Log.e("VideoManager", "Falha ao baixar ${video.originalName}: ${e.message}")
                dest.delete() // remove arquivo parcial
            }
        }

        return changed
    }
}
