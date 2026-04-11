package com.paitv

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/** Inicia o app automaticamente quando o Fire Stick liga. */
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action == Intent.ACTION_BOOT_COMPLETED) {
            val launch = Intent(context, MainActivity::class.java).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            context.startActivity(launch)
        }
    }
}
