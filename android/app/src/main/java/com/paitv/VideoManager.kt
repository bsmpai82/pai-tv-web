package com.paitv

import android.content.Context
import android.util.Log
import java.io.File

class VideoManager(context: Context) {

    private val videosDir = File(context.filesDir, "videos").also { it.mkdirs() }

    fun localFile(filename: String): File = File(videosDir, filename)

    fun isCached(filename: String): Boolean = localFile(filename).exists()

    /**
     * Sincroniza a pasta local com a playlist do servidor:
     * - Baixa arquivos novos (vídeo ou imagem)
     * - Remove arquivos que não estão mais na playlist
     * Retorna true se houve alguma mudança.
     */
    fun sync(items: List<PlaylistItem>, api: ApiClient): Boolean {
        val serverFilenames = items.map { it.filename }.toSet()
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
        for (item in items) {
            val dest = localFile(item.filename)
            if (dest.exists() && dest.length() == item.size) continue // já em cache

            Log.i("VideoManager", "Baixando: ${item.originalName}")
            runCatching {
                api.downloadVideo(item.url, dest) { downloaded, total ->
                    if (total > 0) {
                        val pct = (downloaded * 100 / total).toInt()
                        Log.v("VideoManager", "  ${item.originalName}: $pct%")
                    }
                }
                changed = true
                Log.i("VideoManager", "Concluído: ${item.originalName}")
            }.onFailure { e ->
                Log.e("VideoManager", "Falha ao baixar ${item.originalName}: ${e.message}")
                dest.delete() // remove arquivo parcial
            }
        }

        return changed
    }
}
