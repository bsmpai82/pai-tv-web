package com.paitv

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import android.util.Log

/**
 * Fallback de autostart.
 *
 * O caminho principal é o app ser definido como launcher (HOME) — o sistema
 * então abre o PAI TV sozinho a cada boot. Este receiver cobre o período
 * antes do usuário confirmar o launcher e OEMs que não respeitam HOME.
 *
 * Em Android 10+, startActivity a partir de BroadcastReceiver é bloqueado.
 * Por isso delegamos ao SyncService (foreground service), que tem permissão
 * para subir activity em background após entrar em foreground.
 */
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val action = intent.action ?: return
        Log.i("BootReceiver", "Broadcast recebido: $action")

        when (action) {
            Intent.ACTION_BOOT_COMPLETED,
            Intent.ACTION_LOCKED_BOOT_COMPLETED,
            "android.intent.action.QUICKBOOT_POWERON",
            "com.htc.intent.action.QUICKBOOT_POWERON" -> startSyncServiceAndUi(context)
        }
    }

    private fun startSyncServiceAndUi(context: Context) {
        val svc = Intent(context, SyncService::class.java).apply {
            putExtra(SyncService.EXTRA_LAUNCH_UI, true)
        }
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(svc)
            } else {
                context.startService(svc)
            }
        } catch (e: Exception) {
            Log.e("BootReceiver", "Falha ao subir SyncService: ${e.message}")
        }
    }
}
