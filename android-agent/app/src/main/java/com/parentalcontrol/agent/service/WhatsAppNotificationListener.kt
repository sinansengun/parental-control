package com.parentalcontrol.agent.service

import android.app.Notification
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.Canvas
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import android.util.Base64
import android.util.Log
import com.parentalcontrol.agent.AppLog
import com.parentalcontrol.agent.TokenStore
import com.parentalcontrol.agent.network.ApiClient
import com.parentalcontrol.agent.network.NotificationPayload
import kotlinx.coroutines.*
import java.io.ByteArrayOutputStream

class WhatsAppNotificationListener : NotificationListenerService() {

    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    private val musicTracker by lazy { MusicSessionTracker(this, scope) }

    companion object {
        private const val TAG = "NotifListener"

        // Packages that generate noisy, non-user notifications — skip these
        private val IGNORED_PACKAGES = setOf(
            "android",
            "com.android.systemui",
            "com.android.phone",
            "com.google.android.gms",
            "com.google.android.gsf"
        )
    }

    override fun onListenerConnected() {
        super.onListenerConnected()
        scope.launch {
            TokenStore.loadToken(applicationContext)
            Log.d(TAG, "Notification listener connected, token loaded")
        }
        musicTracker.start()
    }

    override fun onNotificationPosted(sbn: StatusBarNotification?) {
        sbn ?: return
        if (sbn.packageName in IGNORED_PACKAGES) return
        // Skip ongoing (persistent) notifications like media players, navigation, etc.
        if (sbn.notification.flags and Notification.FLAG_ONGOING_EVENT != 0) return

        val extras = sbn.notification.extras ?: return
        val title   = extras.getString(Notification.EXTRA_TITLE) ?: return
        val text    = extras.getCharSequence(Notification.EXTRA_TEXT)?.toString() ?: return
        val bigText = extras.getCharSequence(Notification.EXTRA_BIG_TEXT)?.toString()

        val message = bigText ?: text
        if (message.isBlank()) return

        val pm       = applicationContext.packageManager
        val appName  = try {
            pm.getApplicationLabel(pm.getApplicationInfo(sbn.packageName, 0)).toString()
        } catch (_: PackageManager.NameNotFoundException) { sbn.packageName }

        val appIcon  = try {
            val drawable = pm.getApplicationIcon(sbn.packageName)
            val bmp = Bitmap.createBitmap(48, 48, Bitmap.Config.ARGB_8888)
            val canvas = Canvas(bmp)
            drawable.setBounds(0, 0, 48, 48)
            drawable.draw(canvas)
            val bos = ByteArrayOutputStream()
            bmp.compress(Bitmap.CompressFormat.PNG, 100, bos)
            Base64.encodeToString(bos.toByteArray(), Base64.NO_WRAP)
        } catch (_: Exception) { null }

        Log.d(TAG, "[$appName / $title]: $message")

        scope.launch {
            try {
                if (TokenStore.cachedToken.isEmpty()) TokenStore.loadToken(applicationContext)
                if (TokenStore.cachedToken.isEmpty()) {
                    Log.w(TAG, "No token, skipping")
                    return@launch
                }
                ApiClient.service.sendNotification(
                    NotificationPayload(
                        appPackage = sbn.packageName,
                        appName    = appName,
                        appIcon    = appIcon,
                        sender     = title,
                        message    = message,
                        timestamp  = sbn.postTime
                    )
                )
                Log.d(TAG, "Sent OK")
                AppLog.add(applicationContext, "🔔 [$appName] $title: ${message.take(40)}")
            } catch (e: Exception) {
                Log.e(TAG, "Send failed: ${e.message}")
                AppLog.add(applicationContext, "❌ Notif send failed: ${e.message}")
            }
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        musicTracker.stop()
        scope.cancel()
    }
}
