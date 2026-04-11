package com.paitv

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

/**
 * Recebe o alarme diário das 6h e força uma sincronização completa,
 * mesmo que o hash não tenha mudado.
 */
class SyncAlarmReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        Log.i("SyncAlarmReceiver", "Alarme das 6h recebido — iniciando sync")

        val prefs = DevicePrefs(context)
        val api = ApiClient(BuildConfig.SERVER_URL)
        val videoManager = VideoManager(context)

        // Limpa o hash para forçar download mesmo sem force_sync no servidor
        prefs.lastPlaylistHash = null

        // Inicia (ou reinicia) o SyncService — ele vai detectar a mudança de hash
        val serviceIntent = Intent(context, SyncService::class.java)
        context.startForegroundService(serviceIntent)
    }
}
