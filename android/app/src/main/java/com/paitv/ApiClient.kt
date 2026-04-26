package com.paitv

import com.google.gson.Gson
import com.google.gson.annotations.SerializedName
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.util.concurrent.TimeUnit

data class CheckResponse(
    @SerializedName("playlist_hash") val playlistHash: String,
    @SerializedName("force_sync")    val forceSync: Boolean,
    @SerializedName("has_playlist")  val hasPlaylist: Boolean,
)

data class VideoItem(
    val id: Int,
    val filename: String,
    @SerializedName("original_name") val originalName: String,
    val size: Long,
    val url: String,
)

data class PlaylistInfo(val id: Int, val name: String)

data class PlaylistResponse(
    val playlist: PlaylistInfo?,
    val videos: List<VideoItem>,
)

private data class RegisterResponse(
    val status: String,
    @SerializedName("device_id") val deviceId: Int,
    val token: String?,
)

class ApiClient(private val baseUrl: String) {

    var token: String? = null

    private val client = OkHttpClient.Builder()
        .connectTimeout(10, TimeUnit.SECONDS)
        .readTimeout(60, TimeUnit.SECONDS)
        .build()

    private val gson = Gson()
    private val json = "application/json".toMediaType()

    private fun Request.Builder.addAuth(): Request.Builder =
        token?.let { header("Authorization", "Bearer $it") } ?: this

    /** Registra o dispositivo e retorna o token de autenticação. */
    fun register(deviceUuid: String): String? = runCatching {
        val body = """{"device_uuid":"$deviceUuid"}""".toRequestBody(json)
        val req = Request.Builder().url("$baseUrl/api/device/register").post(body).build()
        client.newCall(req).execute().use { resp ->
            if (!resp.isSuccessful) return null
            gson.fromJson(resp.body!!.string(), RegisterResponse::class.java).token
        }
    }.getOrNull()

    fun check(deviceUuid: String): CheckResponse? = runCatching {
        val req = Request.Builder().url("$baseUrl/api/device/$deviceUuid/check")
            .addAuth().get().build()
        client.newCall(req).execute().use { resp ->
            if (!resp.isSuccessful) return null
            gson.fromJson(resp.body!!.string(), CheckResponse::class.java)
        }
    }.getOrNull()

    fun getPlaylist(deviceUuid: String): PlaylistResponse? = runCatching {
        val req = Request.Builder().url("$baseUrl/api/device/$deviceUuid/playlist")
            .addAuth().get().build()
        client.newCall(req).execute().use { resp ->
            if (!resp.isSuccessful) return null
            gson.fromJson(resp.body!!.string(), PlaylistResponse::class.java)
        }
    }.getOrNull()

    fun heartbeat(deviceUuid: String, appVersion: String? = null, currentVideo: String? = null, localIp: String? = null) = runCatching {
        val payload = buildString {
            append("{")
            appVersion?.let { append("\"app_version\":\"$it\",") }
            currentVideo?.let { append("\"current_video\":\"$it\",") }
            localIp?.let { append("\"local_ip\":\"$it\",") }
            if (endsWith(",")) deleteCharAt(length - 1)
            append("}")
        }
        val body = payload.toRequestBody(json)
        val req = Request.Builder().url("$baseUrl/api/device/$deviceUuid/heartbeat")
            .addAuth().post(body).build()
        client.newCall(req).execute().close()
    }

    /** Faz download de um vídeo e escreve no arquivo de destino. */
    fun downloadVideo(url: String, destFile: java.io.File, onProgress: (Long, Long) -> Unit) {
        val req = Request.Builder().url(url).addAuth().get().build()
        client.newCall(req).execute().use { resp ->
            if (!resp.isSuccessful) error("HTTP ${resp.code}")
            val body = resp.body ?: error("Corpo vazio")
            val total = body.contentLength()
            var downloaded = 0L

            destFile.outputStream().use { out ->
                body.byteStream().use { inp ->
                    val buf = ByteArray(128 * 1024)
                    var n: Int
                    while (inp.read(buf).also { n = it } != -1) {
                        out.write(buf, 0, n)
                        downloaded += n
                        onProgress(downloaded, total)
                    }
                }
            }
        }
    }
}
