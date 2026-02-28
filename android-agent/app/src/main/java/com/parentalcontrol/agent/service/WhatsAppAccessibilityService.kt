package com.parentalcontrol.agent.service

import android.accessibilityservice.AccessibilityService
import android.util.Log
import android.view.accessibility.AccessibilityEvent
import com.parentalcontrol.agent.network.ApiClient
import com.parentalcontrol.agent.network.WhatsAppMessagePayload
import kotlinx.coroutines.*

/**
 * Reads WhatsApp notification text via Accessibility Service.
 * The child's device shows "Family Guard is using Accessibility" in settings —
 * this is transparent and compliant with Google Play parental control policies.
 */
class WhatsAppAccessibilityService : AccessibilityService() {

    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        if (event == null) return
        if (event.packageName?.toString() !in listOf("com.whatsapp", "com.whatsapp.w4b")) return
        if (event.eventType != AccessibilityEvent.TYPE_NOTIFICATION_STATE_CHANGED) return

        val text = event.text.joinToString(" ").trim()
        if (text.isBlank()) return

        // Format: "Contact Name: message content"
        val colonIdx = text.indexOf(":")
        val sender = if (colonIdx > 0) text.substring(0, colonIdx).trim() else "Unknown"
        val message = if (colonIdx > 0) text.substring(colonIdx + 1).trim() else text

        Log.d("WhatsAppService", "[$sender]: $message")

        scope.launch {
            try {
                ApiClient.service.sendWhatsAppMessage(
                    WhatsAppMessagePayload(
                        sender = sender,
                        message = message,
                        timestamp = System.currentTimeMillis()
                    )
                )
            } catch (e: Exception) {
                e.printStackTrace()
            }
        }
    }

    override fun onInterrupt() {}

    override fun onDestroy() {
        super.onDestroy()
        scope.cancel()
    }
}
