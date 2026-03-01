package com.parentalcontrol.agent.service

import android.app.Notification
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import android.util.Log
import com.parentalcontrol.agent.AppLog
import com.parentalcontrol.agent.TokenStore
import com.parentalcontrol.agent.network.ApiClient
import com.parentalcontrol.agent.network.WhatsAppMessagePayload
import kotlinx.coroutines.*

class WhatsAppNotificationListener : NotificationListenerService() {

    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())

    companion object {
        private const val TAG = "WANotifListener"
        private val WHATSAPP_PACKAGES = setOf("com.whatsapp", "com.whatsapp.w4b")
    }

    override fun onListenerConnected() {
        super.onListenerConnected()
        scope.launch {
            TokenStore.loadToken(applicationContext)
            Log.d(TAG, "Notification listener connected, token loaded")
        }
    }

    override fun onNotificationPosted(sbn: StatusBarNotification?) {
        sbn ?: return
        if (sbn.packageName !in WHATSAPP_PACKAGES) return

        val extras = sbn.notification.extras ?: return
        val title   = extras.getString(Notification.EXTRA_TITLE) ?: return   // sender name
        val text    = extras.getCharSequence(Notification.EXTRA_TEXT)?.toString() ?: return
        val bigText = extras.getCharSequence(Notification.EXTRA_BIG_TEXT)?.toString()

        val message = bigText ?: text
        if (message.isBlank()) return

        Log.d(TAG, "[$title]: $message")

        scope.launch {
            try {
                if (TokenStore.cachedToken.isEmpty()) TokenStore.loadToken(applicationContext)
                if (TokenStore.cachedToken.isEmpty()) {
                    Log.w(TAG, "No token, skipping")
                    return@launch
                }
                ApiClient.service.sendWhatsAppMessage(
                    WhatsAppMessagePayload(
                        sender    = title,
                        message   = message,
                        timestamp = sbn.postTime
                    )
                )
                Log.d(TAG, "Sent OK")
                AppLog.add(applicationContext, "💚 WhatsApp [$title]: ${message.take(40)}")
            } catch (e: Exception) {
                Log.e(TAG, "Send failed: ${e.message}")
                AppLog.add(applicationContext, "❌ WhatsApp send failed: ${e.message}")
            }
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        scope.cancel()
    }
}
