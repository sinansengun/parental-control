package com.parentalcontrol.agent

import android.content.Context
import android.content.Intent
import androidx.localbroadcastmanager.content.LocalBroadcastManager
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

object AppLog {

    const val ACTION_LOG_UPDATED = "com.parentalcontrol.agent.LOG_UPDATED"
    private const val MAX_ENTRIES = 50

    private val entries = ArrayDeque<String>(MAX_ENTRIES)
    private val fmt = SimpleDateFormat("HH:mm:ss", Locale.getDefault())

    @Synchronized
    fun add(context: Context, message: String) {
        val line = "[${fmt.format(Date())}] $message"
        if (entries.size >= MAX_ENTRIES) entries.removeFirst()
        entries.addLast(line)
        LocalBroadcastManager.getInstance(context)
            .sendBroadcast(Intent(ACTION_LOG_UPDATED))
    }

    @Synchronized
    fun getAll(): List<String> = entries.toList().reversed()  // newest first
}
