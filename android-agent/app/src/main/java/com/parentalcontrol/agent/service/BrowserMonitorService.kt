package com.parentalcontrol.agent.service

import android.accessibilityservice.AccessibilityService
import android.util.Log
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo
import com.parentalcontrol.agent.AppLog
import com.parentalcontrol.agent.TokenStore
import com.parentalcontrol.agent.network.ApiClient
import com.parentalcontrol.agent.network.BrowserHistoryEntry
import kotlinx.coroutines.*

private const val TAG = "BrowserMonitor"

// URL bar view IDs for common browsers
private val URL_BAR_IDS = listOf(
    "com.android.chrome:id/url_bar",
    "org.chromium.chrome:id/url_bar",
    "com.brave.browser:id/url_bar",
    "com.microsoft.emmx:id/url_bar",
    "com.kiwibrowser.browser:id/url_bar",
    "org.mozilla.firefox:id/mozac_browser_toolbar_url_view",
    "org.mozilla.firefox:id/toolbar_display_url",
    "com.sec.android.app.sbrowser:id/location_bar_edit_text",
    "com.sec.android.app.sbrowser:id/sb_url_bar",
    "com.opera.browser:id/url_field"
)

private val BROWSER_LABELS = mapOf(
    "com.android.chrome"           to "Chrome",
    "org.chromium.chrome"          to "Chromium",
    "com.brave.browser"            to "Brave",
    "com.microsoft.emmx"           to "Edge",
    "com.kiwibrowser.browser"      to "Kiwi",
    "org.mozilla.firefox"          to "Firefox",
    "com.sec.android.app.sbrowser" to "Samsung Internet",
    "com.opera.browser"            to "Opera"
)

// Regex to detect a URL-like string (anywhere in the text, with or without protocol)
private val URL_RE      = Regex("https?://[^\\s]{4,}")
// Matches strings that look like a URL even without protocol (e.g. "google.com/search?q=...")
private val DOMAIN_RE   = Regex("^[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}(/[^\\s]*)?$")

class BrowserMonitorService : AccessibilityService() {

    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    private var lastSentUrl = ""
    private var lastSentMs  = 0L

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        val pkg = event?.packageName?.toString() ?: return
        if (!BROWSER_LABELS.containsKey(pkg)) return

        // 1. Try event.getText() list — Chrome often puts the URL here on navigation
        val url = extractFromEvent(event) ?: extractFromWindowTree(pkg) ?: return

        if (!url.startsWith("http")) return
        val now = System.currentTimeMillis()
        if (url == lastSentUrl && now - lastSentMs < 10_000) return
        lastSentUrl = url
        lastSentMs  = now

        val browserLabel = BROWSER_LABELS[pkg] ?: pkg
        val title = runCatching {
            java.net.URI(url).host?.removePrefix("www.") ?: url
        }.getOrElse { url }

        Log.d(TAG, "[$browserLabel] $url")

        scope.launch {
            try {
                if (TokenStore.cachedToken.isEmpty()) TokenStore.loadToken(applicationContext)
                if (TokenStore.cachedToken.isEmpty()) return@launch
                val iconBase64: String? = null
                ApiClient.service.sendBrowserVisit(
                    BrowserHistoryEntry(url = url, title = title, browser = browserLabel, iconBase64 = iconBase64, timestamp = now)
                )
                AppLog.add(applicationContext, "\uD83C\uDF10 $title")
            } catch (e: Exception) {
                Log.w(TAG, "Failed to send browser visit: ${e.message}")
            }
        }
    }

    /**
     * Chrome & most Chromium browsers fire TYPE_WINDOW_STATE_CHANGED with the
     * current URL in event.getText() when the user navigates to a new page.
     * For searches the page title is in getText(), so we also check the URL bar via tree.
     */
    private fun extractFromEvent(event: AccessibilityEvent): String? {
        for (text in event.text) {
            val s = text?.toString()?.trim() ?: continue
            // Direct URL in event text
            val match = URL_RE.find(s)
            if (match != null) {
                return match.value
            }
        }
        // Also try contentDescription
        val cd = event.contentDescription?.toString()?.trim()
        if (cd != null) {
            val match = URL_RE.find(cd)
            if (match != null) return match.value
        }
        return null
    }

    /**
     * Fallback: walk the window accessibility tree looking for a known URL bar view.
     */
    private fun extractFromWindowTree(pkg: String): String? {
        val root = rootInActiveWindow ?: return null
        return try { extractFromNode(root, pkg) } finally { root.recycle() }
    }

    private fun extractFromNode(root: AccessibilityNodeInfo, pkg: String): String? {
        for (id in URL_BAR_IDS) {
            val nodes = root.findAccessibilityNodeInfosByViewId(id)
            if (nodes.isNotEmpty()) {
                val text = nodes[0].text?.toString()?.trim()
                nodes.forEach { it.recycle() }
                if (!text.isNullOrEmpty()) {
                    // Full URL with protocol
                    if (text.startsWith("http")) return text
                    // Protocol-less URL (Chrome omits https:// in display)
                    if (DOMAIN_RE.matches(text)) return "https://$text"
                }
            }
        }
        return findUrlDFS(root)
    }

    private fun findUrlDFS(node: AccessibilityNodeInfo): String? {
        val text = node.text?.toString()?.trim()
        if (text != null) {
            val match = URL_RE.find(text)
            if (match != null) return match.value
            if (DOMAIN_RE.matches(text)) return "https://$text"
        }
        for (i in 0 until node.childCount) {
            val child = node.getChild(i) ?: continue
            val found = findUrlDFS(child)
            child.recycle()
            if (found != null) return found
        }
        return null
    }

    override fun onInterrupt() = Unit

    override fun onDestroy() {
        scope.cancel()
        super.onDestroy()
    }
}
