package com.parentalcontrol.agent.service

import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.AccessibilityServiceInfo
import android.util.Log
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo
import com.parentalcontrol.agent.AppLog
import com.parentalcontrol.agent.TokenStore
import com.parentalcontrol.agent.network.ApiClient
import com.parentalcontrol.agent.network.WhatsAppChatPayload
import kotlinx.coroutines.*

// Candidate view IDs  WhatsApp obfuscates these in newer builds so we try multiple
private val CHAT_TITLE_IDS = listOf(
    "com.whatsapp:id/conversation_contact_name",
    "com.whatsapp:id/contact_name",
    "com.whatsapp:id/toolbar_title",
    "com.whatsapp.w4b:id/conversation_contact_name",
    "com.whatsapp.w4b:id/contact_name"
)
private val MSG_TEXT_IDS = listOf(
    "com.whatsapp:id/message_text",
    "com.whatsapp:id/msg_text",
    "com.whatsapp.w4b:id/message_text",
    "com.whatsapp.w4b:id/msg_text"
)
private val SENDER_IDS = listOf(
    "com.whatsapp:id/from_name",
    "com.whatsapp:id/sender_name",
    "com.whatsapp.w4b:id/from_name",
    "com.whatsapp.w4b:id/sender_name"
)
private val BLOCKED_NAMES = setOf(
    "durum ekle", "add status", "add to my status", "durumum", "my status",
    "son gorulme", "last seen", "cevrimici", "online", "yaziyor...", "typing...",
    "yeni grup", "new group", "yeni yayin", "new broadcast",
    "linked devices", "bagli cihazlar", "whatsapp web",
    "ayarlar", "settings", "aramalar", "calls", "topluluklar", "communities",
    "durum", "status", "ara\u2026", "ara...", "search", "cevapsiz sesli arama",
    "missed voice call", "cevapsiz goruntulu arama", "missed video call",
    "takip edebileceginiz kanallar bulun", "find channels you can follow"
)

// Matches pure timestamps like "21:49", "9:05", "15:24 PM" etc.
private val TIMESTAMP_RE = Regex("""^\d{1,2}:\d{2}(\s*(AM|PM))?$""", RegexOption.IGNORE_CASE)
// Matches date strings like "27.02.2026", "Dün", "Yesterday", "Pazartesi" etc.
private val DATE_RE = Regex("""^\d{1,2}[./]\d{1,2}([./]\d{2,4})?$|^(dün|yesterday|pazartesi|salı|çarşamba|perşembe|cuma|cumartesi|pazar|monday|tuesday|wednesday|thursday|friday|saturday|sunday)$""", RegexOption.IGNORE_CASE)

/**
 * Reads actual WhatsApp chat messages from the screen using AccessibilityService.
 */
class WhatsAppAccessibilityService : AccessibilityService() {

    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    private var currentChat = ""
    private val seen = HashSet<String>()
    private var lastScanMs = 0L

    companion object {
        private const val TAG = "WAAccessibility"
        private val WA_PACKAGES = setOf("com.whatsapp", "com.whatsapp.w4b")
    }

    override fun onServiceConnected() {
        super.onServiceConnected()
        serviceInfo = serviceInfo.apply {
            eventTypes = AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED or
                         AccessibilityEvent.TYPE_WINDOW_CONTENT_CHANGED or
                         AccessibilityEvent.TYPE_VIEW_SCROLLED
            feedbackType = AccessibilityServiceInfo.FEEDBACK_GENERIC
            flags = AccessibilityServiceInfo.FLAG_REPORT_VIEW_IDS or
                    AccessibilityServiceInfo.FLAG_RETRIEVE_INTERACTIVE_WINDOWS
            packageNames = WA_PACKAGES.toTypedArray()
            notificationTimeout = 100
        }
        scope.launch {
            TokenStore.loadToken(applicationContext)
            AppLog.add(applicationContext, "WA Accessibility connected")
            Log.d(TAG, "Accessibility service connected")
        }
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        event ?: return
        if (event.packageName?.toString() !in WA_PACKAGES) return

        when (event.eventType) {
            AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED -> {
                val newChat = findChatTitle()
                if (newChat != null && newChat != currentChat) {
                    Log.d(TAG, "Chat opened: $newChat")
                    AppLog.add(applicationContext, "WA Chat opened: $newChat")
                    currentChat = newChat
                    seen.clear()
                }
            }
            AccessibilityEvent.TYPE_WINDOW_CONTENT_CHANGED,
            AccessibilityEvent.TYPE_VIEW_SCROLLED -> {
                val now = System.currentTimeMillis()
                if (now - lastScanMs < 1000) return
                lastScanMs = now

                // Re-resolve chat title on every scan in case WINDOW_STATE_CHANGED was missed
                val detectedChat = findChatTitle()
                if (detectedChat != null && detectedChat != currentChat) {
                    Log.d(TAG, "Chat re-detected: $detectedChat")
                    AppLog.add(applicationContext, "WA Chat: $detectedChat")
                    currentChat = detectedChat
                    seen.clear()
                }

                if (currentChat.isBlank()) {
                    Log.d(TAG, "No current chat, skipping scan")
                    return
                }
                scanAndUpload()
            }
        }
    }

    private fun findChatTitle(): String? {
        val root = rootInActiveWindow ?: return null
        for (id in CHAT_TITLE_IDS) {
            val nodes = root.findAccessibilityNodeInfosByViewId(id)
            if (nodes.isNotEmpty()) {
                val title = nodes[0].text?.toString()?.trim()
                if (!title.isNullOrBlank() && title.lowercase() !in BLOCKED_NAMES) {
                    Log.d(TAG, "Chat title via $id: $title")
                    return title
                }
            }
        }
        return null
    }

    private fun scanAndUpload() {
        val root = rootInActiveWindow ?: return
        val messages = mutableListOf<Pair<String, String>>()

        val msgNodes = mutableListOf<AccessibilityNodeInfo>()
        for (id in MSG_TEXT_IDS) {
            msgNodes.addAll(root.findAccessibilityNodeInfosByViewId(id))
        }

        // Tree fallback disabled — too noisy (captures contact list, timestamps, etc.)
        if (msgNodes.isEmpty()) {
            Log.d(TAG, "No message nodes found via viewId for '$currentChat', skipping")
            return
        }

        Log.d(TAG, "Found ${msgNodes.size} nodes in '$currentChat'")

        for (node in msgNodes) {
            val text = node.text?.toString()?.trim() ?: continue
            if (!isValidMessage(text)) continue
            val sender = findSenderForMessage(node) ?: currentChat   // unknown → assume incoming
            messages.add(sender to text)
        }

        val newMessages = messages.filter { (sender, text) ->
            seen.add("$currentChat|$sender|$text")
        }
        if (newMessages.isEmpty()) return

        val chat = currentChat
        val ts   = System.currentTimeMillis()
        Log.d(TAG, "Uploading ${newMessages.size} messages for '$chat'")

        scope.launch {
            if (TokenStore.cachedToken.isEmpty()) TokenStore.loadToken(applicationContext)
            if (TokenStore.cachedToken.isEmpty()) {
                Log.e(TAG, "Token empty")
                AppLog.add(applicationContext, "WA Chat: token empty")
                return@launch
            }

            newMessages.forEach { (sender, text) ->
                try {
                    val response = ApiClient.service.sendWhatsAppChat(
                        WhatsAppChatPayload(chat = chat, sender = sender, message = text, timestamp = ts)
                    )
                    if (response.isSuccessful) {
                        Log.d(TAG, "OK [$chat] $sender: $text")
                        AppLog.add(applicationContext, "WA [$chat] $sender: ${text.take(40)}")
                    } else {
                        Log.e(TAG, "HTTP ${response.code()} [$chat]")
                        AppLog.add(applicationContext, "WA Chat HTTP ${response.code()}: $sender")
                    }
                } catch (e: Exception) {
                    Log.e(TAG, "Error: ${e.message}")
                    AppLog.add(applicationContext, "WA Chat error: ${e.message?.take(60)}")
                }
            }
        }
    }

    private fun isValidMessage(text: String): Boolean {
        if (text.length < 2) return false
        val lower = text.lowercase().trim()
        if (lower in BLOCKED_NAMES) return false
        if (TIMESTAMP_RE.matches(text.trim())) return false
        if (DATE_RE.matches(lower)) return false
        // Filter single emoji or single characters
        if (text.trim().codePointCount(0, text.trim().length) == 1) return false
        // Filter if text matches current chat name exactly (contact names showing up as messages)
        if (lower == currentChat.lowercase()) return false
        return true
    }

    private fun collectTextNodes(node: AccessibilityNodeInfo, out: MutableList<AccessibilityNodeInfo>) {
        if (node.childCount == 0 && !node.text.isNullOrBlank()) {
            out.add(node)
            return
        }
        for (i in 0 until node.childCount) {
            node.getChild(i)?.let { collectTextNodes(it, out) }
        }
    }

    private fun findSenderForMessage(msgNode: AccessibilityNodeInfo): String? {
        // ── 1. Explicit sender label (group chats) ───────────────────────────
        var node: AccessibilityNodeInfo? = msgNode
        repeat(6) {
            node = node?.parent ?: return@repeat
            for (id in SENDER_IDS) {
                node?.findAccessibilityNodeInfosByViewId(id)?.firstOrNull()?.let { n ->
                    val name = n.text?.toString()?.trim()
                    if (!name.isNullOrBlank() && name.lowercase() !in BLOCKED_NAMES) return name
                }
            }
        }

        // ── 2. Content description heuristic ("Sent" / "Gönderildi") ────────
        val cd = msgNode.contentDescription?.toString()?.lowercase() ?: ""
        if (cd.contains("sent") || cd.contains("gönderildi") || cd.contains("gonderildi")) {
            return "__me__"
        }

        // ── 3. Position on screen — right-half = outgoing ────────────────────
        val metrics = applicationContext.resources.displayMetrics
        val screenWidth = metrics.widthPixels
        val rect = android.graphics.Rect()
        msgNode.getBoundsInScreen(rect)
        Log.v(TAG, "Msg bounds: left=${rect.left} right=${rect.right} screenW=$screenWidth text=${msgNode.text?.take(20)}")
        return if (rect.left > screenWidth / 2) "__me__" else currentChat
    }

    override fun onInterrupt() {}

    override fun onDestroy() {
        super.onDestroy()
        scope.cancel()
    }
}