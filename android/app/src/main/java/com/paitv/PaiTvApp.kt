package com.paitv

import android.app.Application
import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Intent
import java.util.Calendar

class PaiTvApp : Application() {

    override fun onCreate() {
        super.onCreate()
        scheduleDailyAlarm()
    }

    /** Agenda o alarme diário às 6h para sync automático. */
    private fun scheduleDailyAlarm() {
        val alarmManager = getSystemService(AlarmManager::class.java)

        val intent = Intent(this, SyncAlarmReceiver::class.java).apply {
            action = "com.paitv.ACTION_SYNC_ALARM"
        }
        val pendingIntent = PendingIntent.getBroadcast(
            this, 0, intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val target = Calendar.getInstance().apply {
            set(Calendar.HOUR_OF_DAY, 6)
            set(Calendar.MINUTE, 0)
            set(Calendar.SECOND, 0)
            set(Calendar.MILLISECOND, 0)
            // Se já passou das 6h hoje, agenda para amanhã
            if (timeInMillis <= System.currentTimeMillis()) {
                add(Calendar.DAY_OF_YEAR, 1)
            }
        }

        alarmManager.setRepeating(
            AlarmManager.RTC_WAKEUP,
            target.timeInMillis,
            AlarmManager.INTERVAL_DAY,
            pendingIntent
        )
    }
}
