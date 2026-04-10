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
import java.time.DayOfWeek
import java.time.LocalDate
import java.time.ZoneId

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
    "com.whatsapp:id/group_sender",
    "com.whatsapp:id/name_in_group_tv",
    "com.whatsapp.w4b:id/from_name",
    "com.whatsapp.w4b:id/sender_name",
    "com.whatsapp.w4b:id/group_sender",
    "com.whatsapp.w4b:id/name_in_group_tv"
)
private val DATE_HEADER_IDS = listOf(
    "com.whatsapp:id/date",
    "com.whatsapp:id/date_text",
    "com.whatsapp:id/chat_date",
    "com.whatsapp.w4b:id/date",
    "com.whatsapp.w4b:id/date_text",
    "com.whatsapp.w4b:id/chat_date"
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
private val DATE_RE = Regex("""^\d{1,2}[./]\d{1,2}([./]\d{2,4})?$|^(bugün|today|dün|yesterday|pazartesi|salı|çarşamba|perşembe|cuma|cumartesi|pazar|monday|tuesday|wednesday|thursday|friday|saturday|sunday)$""", RegexOption.IGNORE_CASE)

// Map day names → DayOfWeek
private val DAY_NAME_MAP = mapOf(
    "pazartesi" to DayOfWeek.MONDAY, "monday" to DayOfWeek.MONDAY,
    "salı" to DayOfWeek.TUESDAY, "tuesday" to DayOfWeek.TUESDAY,
    "çarşamba" to DayOfWeek.WEDNESDAY, "wednesday" to DayOfWeek.WEDNESDAY,
    "perşembe" to DayOfWeek.THURSDAY, "thursday" to DayOfWeek.THURSDAY,
    "cuma" to DayOfWeek.FRIDAY, "friday" to DayOfWeek.FRIDAY,
    "cumartesi" to DayOfWeek.SATURDAY, "saturday" to DayOfWeek.SATURDAY,
    "pazar" to DayOfWeek.SUNDAY, "sunday" to DayOfWeek.SUNDAY
)

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

        // 1. Collect date separators with their Y positions
        val dateSeparators = findDateSeparators(root)

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

        // 2. Extract messages with sender, time, and computed timestamp
        data class MsgInfo(val sender: String, val text: String, val messageTime: String?, val timestamp: Long)
        val messages = mutableListOf<MsgInfo>()

        for (node in msgNodes) {
            val text = node.text?.toString()?.trim() ?: continue
            if (!isValidMessage(text)) continue
            val sender = findSenderForMessage(node) ?: currentChat   // null → assume contact in 1:1

            // Extract the visible time (e.g. "21:49") from the message row
            val timeStr = findTimeForMessage(node)
            // Find the date context from the nearest date separator above this message
            val dateStr = findDateForMessage(node, dateSeparators)
            // Compute a real timestamp from date + time
            val ts = computeTimestamp(dateStr, timeStr)

            messages.add(MsgInfo(sender, text, timeStr, ts))
        }

        // Preserve on-screen order: add millisecond offsets within the same timestamp
        for (i in 1 until messages.size) {
            if (messages[i].timestamp <= messages[i - 1].timestamp) {
                messages[i] = messages[i].copy(timestamp = messages[i - 1].timestamp + 1)
            }
        }

        // 3. Deduplicate: use chat + sender + text + messageTime
        val newMessages = messages.filter { msg ->
            seen.add("$currentChat|${msg.sender}|${msg.text}|${msg.messageTime}")
        }
        if (newMessages.isEmpty()) return

        val chat = currentChat
        Log.d(TAG, "Uploading ${newMessages.size} messages for '$chat'")

        scope.launch {
            if (TokenStore.cachedToken.isEmpty()) TokenStore.loadToken(applicationContext)
            if (TokenStore.cachedToken.isEmpty()) {
                Log.e(TAG, "Token empty")
                AppLog.add(applicationContext, "WA Chat: token empty")
                return@launch
            }

            newMessages.forEach { msg ->
                try {
                    val response = ApiClient.service.sendWhatsAppChat(
                        WhatsAppChatPayload(
                            chat = chat,
                            sender = msg.sender,
                            message = msg.text,
                            messageTime = msg.messageTime,
                            timestamp = msg.timestamp
                        )
                    )
                    if (response.isSuccessful) {
                        Log.d(TAG, "OK [$chat] ${msg.sender}: ${msg.text} @${msg.messageTime}")
                        AppLog.add(applicationContext, "WA [$chat] ${msg.sender}: ${msg.text.take(40)}")
                    } else {
                        Log.e(TAG, "HTTP ${response.code()} [$chat]")
                        AppLog.add(applicationContext, "WA Chat HTTP ${response.code()}: ${msg.sender}")
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

        // ── 2. Content description on the message bubble or its parent ───────
        //    WhatsApp sets contentDescription like:
        //      "Ali Veli, Merhaba nasılsın, 21:49"  (group incoming)
        //      "You, Merhaba, 21:49"  (group outgoing)
        //      "Sent. Merhaba. 21:49" (1:1 outgoing)
        val msgText = msgNode.text?.toString()?.trim() ?: ""
        val cd = findContentDescription(msgNode)
        if (cd != null) {
            val cdLower = cd.lowercase()

            // Outgoing message indicators
            if (cdLower.startsWith("you,") || cdLower.startsWith("sen,") ||
                cdLower.startsWith("siz,") || cdLower.contains("sent") ||
                cdLower.contains("gönderildi") || cdLower.contains("gonderildi")) {
                return "__me__"
            }

            // Group incoming: "SenderName, message text, time"
            // Extract sender name from the beginning of contentDescription
            if (cd.contains(",") && msgText.isNotBlank()) {
                val firstComma = cd.indexOf(",")
                val candidateSender = cd.substring(0, firstComma).trim()
                if (candidateSender.isNotBlank() &&
                    candidateSender.length <= 60 &&
                    candidateSender.lowercase() !in BLOCKED_NAMES &&
                    !TIMESTAMP_RE.matches(candidateSender)) {
                    return candidateSender
                }
            }
        }

        // ── 3. Position on screen — right-half = outgoing ────────────────────
        val metrics = applicationContext.resources.displayMetrics
        val screenWidth = metrics.widthPixels
        val rect = android.graphics.Rect()
        msgNode.getBoundsInScreen(rect)
        Log.v(TAG, "Msg bounds: left=${rect.left} right=${rect.right} screenW=$screenWidth text=${msgNode.text?.take(20)}")
        return if (rect.left > screenWidth / 2) "__me__" else null
    }

    /**
     * Walks up the node hierarchy (up to 5 levels) looking for a contentDescription.
     */
    private fun findContentDescription(node: AccessibilityNodeInfo): String? {
        var current: AccessibilityNodeInfo? = node
        repeat(5) {
            current ?: return null
            val cd = current!!.contentDescription?.toString()?.trim()
            if (!cd.isNullOrBlank() && cd.length > 3) return cd
            current = current!!.parent
        }
        return null
    }

    // ── Time & Date extraction ───────────────────────────────────────────────

    /**
     * Finds the visible time text (e.g. "21:49") for a message node
     * by traversing its parent hierarchy and looking for timestamp-matching siblings.
     */
    private fun findTimeForMessage(msgNode: AccessibilityNodeInfo): String? {
        var parent: AccessibilityNodeInfo? = msgNode.parent ?: return null
        repeat(4) {
            parent ?: return null
            val texts = mutableListOf<AccessibilityNodeInfo>()
            collectTextNodes(parent!!, texts)
            for (t in texts) {
                val text = t.text?.toString()?.trim() ?: continue
                if (TIMESTAMP_RE.matches(text)) return text
            }
            parent = parent?.parent
        }
        return null
    }

    /**
     * Collects date separators visible on screen with their Y positions.
     * Uses both known view IDs and text-matching fallback.
     */
    private fun findDateSeparators(root: AccessibilityNodeInfo): List<Pair<Int, String>> {
        val result = mutableListOf<Pair<Int, String>>()
        val rect = android.graphics.Rect()

        // Try known date header view IDs first
        for (id in DATE_HEADER_IDS) {
            val nodes = root.findAccessibilityNodeInfosByViewId(id)
            for (node in nodes) {
                val text = node.text?.toString()?.trim() ?: continue
                if (text.isNotBlank()) {
                    node.getBoundsInScreen(rect)
                    result.add(rect.top to text)
                }
            }
        }

        // Fallback: scan all text nodes for date-matching strings
        if (result.isEmpty()) {
            val allTexts = mutableListOf<AccessibilityNodeInfo>()
            collectTextNodes(root, allTexts)
            for (node in allTexts) {
                val text = node.text?.toString()?.trim() ?: continue
                val lower = text.lowercase()
                if (DATE_RE.matches(lower) || lower == "bugün" || lower == "today") {
                    node.getBoundsInScreen(rect)
                    result.add(rect.top to text)
                }
            }
        }

        return result.sortedBy { it.first }
    }

    /**
     * Finds the date context for a message by Y position.
     * - First looks for the closest date separator ABOVE the message.
     * - If none found (message is above all visible separators), looks for the
     *   first separator BELOW the message, resolves its date, goes back one day,
     *   and returns that date string so the message is correctly placed before
     *   the next day's separator.
     */
    private fun findDateForMessage(
        msgNode: AccessibilityNodeInfo,
        dateSeparators: List<Pair<Int, String>>
    ): String? {
        if (dateSeparators.isEmpty()) return null
        val rect = android.graphics.Rect()
        msgNode.getBoundsInScreen(rect)
        val msgY = rect.top

        // Separator above → use it directly
        val above = dateSeparators.lastOrNull { it.first < msgY }
        if (above != null) return above.second

        // No separator above → find the first separator below and go back one day
        val below = dateSeparators.firstOrNull { it.first >= msgY }
        if (below != null) {
            val belowDate = resolveDateFromLabel(below.second)
            val prevDay = belowDate.minusDays(1)
            return formatDateForLookup(prevDay)
        }
        return null
    }

    /**
     * Resolves a date label (e.g. "Bugün", "Dün", "Pazartesi", "27.02.2026") to a LocalDate.
     */
    private fun resolveDateFromLabel(label: String): LocalDate {
        val today = LocalDate.now()
        val lower = label.lowercase().trim()
        return when {
            lower in listOf("bugün", "today") -> today
            lower in listOf("dün", "yesterday") -> today.minusDays(1)
            DAY_NAME_MAP.containsKey(lower) -> {
                val targetDay = DAY_NAME_MAP[lower]!!
                var d = today.minusDays(1)
                for (i in 0 until 7) {
                    if (d.dayOfWeek == targetDay) break
                    d = d.minusDays(1)
                }
                d
            }
            else -> {
                try {
                    val parts = label.split(".", "/")
                    val day = parts[0].toInt()
                    val month = parts[1].toInt()
                    val year = if (parts.size > 2) {
                        val y = parts[2].toInt()
                        if (y < 100) y + 2000 else y
                    } else today.year
                    LocalDate.of(year, month, day)
                } catch (_: Exception) { today }
            }
        }
    }

    /**
     * Formats a LocalDate back into a dd.MM.yyyy string that computeTimestamp can parse.
     */
    private fun formatDateForLookup(date: LocalDate): String {
        return "${date.dayOfMonth}.${date.monthValue}.${date.year}"
    }

    /**
     * Computes an epoch-millis timestamp from a date separator string and a time string.
     * Falls back to System.currentTimeMillis() if parsing fails.
     */
    private fun computeTimestamp(dateStr: String?, timeStr: String?): Long {
        if (timeStr == null) return System.currentTimeMillis()

        val date = if (dateStr != null) resolveDateFromLabel(dateStr) else LocalDate.now()

        // Parse time "21:49" or "9:05 AM"
        try {
            val cleaned = timeStr.trim()
            val isPM = cleaned.contains("PM", ignoreCase = true)
            val isAM = cleaned.contains("AM", ignoreCase = true)
            val timePart = cleaned.replace(Regex("\\s*(AM|PM)\\s*", RegexOption.IGNORE_CASE), "")
            val parts = timePart.split(":")
            var hour = parts[0].trim().toInt()
            val minute = parts.getOrNull(1)?.trim()?.toInt() ?: 0
            if (isPM && hour < 12) hour += 12
            if (isAM && hour == 12) hour = 0
            val dateTime = date.atTime(hour, minute)
            val epochMs = dateTime.atZone(ZoneId.systemDefault()).toInstant().toEpochMilli()
            // Never return a future timestamp
            val now = System.currentTimeMillis()
            return if (epochMs > now) now else epochMs
        } catch (_: Exception) {
            return System.currentTimeMillis()
        }
    }

    override fun onInterrupt() {}

    override fun onDestroy() {
        super.onDestroy()
        scope.cancel()
    }
}