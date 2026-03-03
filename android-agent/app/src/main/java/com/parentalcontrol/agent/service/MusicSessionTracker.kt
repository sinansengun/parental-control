package com.parentalcontrol.agent.service

import android.content.ComponentName
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.media.MediaMetadata
import android.media.session.MediaController
import android.media.session.MediaSessionManager
import android.media.session.PlaybackState
import android.net.Uri
import android.util.Base64
import android.util.Log
import com.parentalcontrol.agent.AppLog
import com.parentalcontrol.agent.TokenStore
import com.parentalcontrol.agent.network.ApiClient
import com.parentalcontrol.agent.network.MusicPlayPayload
import kotlinx.coroutines.*
import java.io.ByteArrayOutputStream
import java.net.HttpURLConnection
import java.net.URL

/**
 * Tracks active MediaSessions (Spotify, YouTube Music, etc.) using
 * MediaSessionManager — no extra permissions needed beyond
 * BIND_NOTIFICATION_LISTENER_SERVICE which WhatsAppNotificationListener already holds.
 *
 * Attach via [start] in onListenerConnected, detach via [stop] in onDestroy.
 */
class MusicSessionTracker(
    private val service: WhatsAppNotificationListener,
    private val scope: CoroutineScope
) {
    companion object {
        private const val TAG = "MusicTracker"
        /** Minimum gap between sending the same track from the same app (ms). */
        private const val DEBOUNCE_MS = 8_000L
    }

    private val msm: MediaSessionManager by lazy {
        service.getSystemService(MediaSessionManager::class.java)
    }

    /** packageName → last sent "title|artist" + epoch ms */
    private val lastSent = HashMap<String, Pair<String, Long>>()
    private val callbacks    = HashMap<String, MediaController.Callback>()
    private val controllersMap = HashMap<String, MediaController>()

    private val sessionsChangedListener =
        MediaSessionManager.OnActiveSessionsChangedListener { newList ->
            onSessionsChanged(newList ?: emptyList())
        }

    // ── Public API ─────────────────────────────────────────────────────────────

    fun start() {
        try {
            val componentName = ComponentName(service, WhatsAppNotificationListener::class.java)
            msm.addOnActiveSessionsChangedListener(sessionsChangedListener, componentName)
            onSessionsChanged(msm.getActiveSessions(componentName))
            Log.d(TAG, "started")
        } catch (e: Exception) {
            Log.e(TAG, "start failed: ${e.message}")
        }
    }

    fun stop() {
        try {
            msm.removeOnActiveSessionsChangedListener(sessionsChangedListener)
            for ((pkg, cb) in callbacks) controllersMap[pkg]?.unregisterCallback(cb)
            callbacks.clear()
            controllersMap.clear()
        } catch (_: Exception) {}
    }

    // ── Internal ───────────────────────────────────────────────────────────────

    private fun onSessionsChanged(list: List<MediaController>) {
        val currentPkgs = list.map { it.packageName }.toSet()

        // Remove callbacks for sessions that disappeared
        val stale = controllersMap.keys.toList().filter { it !in currentPkgs }
        for (pkg in stale) {
            callbacks[pkg]?.let { controllersMap[pkg]?.unregisterCallback(it) }
            callbacks.remove(pkg)
            controllersMap.remove(pkg)
        }

        // Register on new controllers
        for (controller in list) {
            val pkg = controller.packageName
            if (pkg in controllersMap) continue

            val cb = object : MediaController.Callback() {
                override fun onMetadataChanged(metadata: MediaMetadata?) {
                    // Only send when actively playing
                    val state = controller.playbackState
                    if (state?.state != PlaybackState.STATE_PLAYING) return
                    metadata?.let { onTrackChanged(pkg, it) }
                }

                override fun onPlaybackStateChanged(state: PlaybackState?) {
                    if (state?.state != PlaybackState.STATE_PLAYING) return
                    controller.metadata?.let { onTrackChanged(pkg, it) }
                }
            }

            controller.registerCallback(cb)
            callbacks[pkg]    = cb
            controllersMap[pkg] = controller

            // Fire immediately if something is already playing
            val state = controller.playbackState
            if (state?.state == PlaybackState.STATE_PLAYING) {
                controller.metadata?.let { onTrackChanged(pkg, it) }
            }
        }
    }

    private fun onTrackChanged(pkg: String, meta: MediaMetadata) {
        val title  = meta.getString(MediaMetadata.METADATA_KEY_TITLE)  ?: return
        val artist = meta.getString(MediaMetadata.METADATA_KEY_ARTIST)
            ?: meta.getString(MediaMetadata.METADATA_KEY_ALBUM_ARTIST)
            ?: ""
        val album    = meta.getString(MediaMetadata.METADATA_KEY_ALBUM)
        val duration = meta.getLong(MediaMetadata.METADATA_KEY_DURATION).takeIf { it > 0 }

        // Snapshot the art URI on the main thread (bitmap fetch happens in coroutine)
        val artBitmapImmediate = meta.getBitmap(MediaMetadata.METADATA_KEY_ART)
            ?: meta.getBitmap(MediaMetadata.METADATA_KEY_ALBUM_ART)
        val artUri = meta.getString(MediaMetadata.METADATA_KEY_ART_URI)

        val key = "$title|$artist"
        val now = System.currentTimeMillis()
        val prev = lastSent[pkg]
        if (prev != null && prev.first == key && now - prev.second < DEBOUNCE_MS) return
        lastSent[pkg] = key to now

        Log.d(TAG, "[$pkg] $title – $artist")

        scope.launch(Dispatchers.IO) {
            // Resolve album art on IO thread (URI fetch may require network)
            val albumArtBase64: String? = try {
                val bmp = artBitmapImmediate
                    ?: artUri?.let { loadBitmapFromUri(it) }
                if (bmp != null) {
                    val scaled = Bitmap.createScaledBitmap(bmp, 96, 96, true)
                    val bos    = ByteArrayOutputStream()
                    scaled.compress(Bitmap.CompressFormat.JPEG, 80, bos)
                    Base64.encodeToString(bos.toByteArray(), Base64.NO_WRAP)
                } else null
            } catch (_: Exception) { null }

            try {
                if (TokenStore.cachedToken.isEmpty()) TokenStore.loadToken(service)
                if (TokenStore.cachedToken.isEmpty()) return@launch
                ApiClient.service.sendMusicPlay(
                    MusicPlayPayload(
                        appPackage     = pkg,
                        trackTitle     = title,
                        artistName     = artist,
                        albumName      = album?.ifEmpty { null },
                        durationMs     = duration,
                        albumArtBase64 = albumArtBase64,
                        timestamp      = now
                    )
                )
                AppLog.add(service, "🎵 $title – $artist")
            } catch (e: Exception) {
                Log.e(TAG, "send failed: ${e.message}")
            }
        }
    }

    /** Load a Bitmap from a content:// or http(s):// URI string. */
    private fun loadBitmapFromUri(uriStr: String): Bitmap? = try {
        val uri = Uri.parse(uriStr)
        when (uri.scheme) {
            "content" -> service.contentResolver.openInputStream(uri)
                ?.use { BitmapFactory.decodeStream(it) }
            "http", "https" -> {
                val conn = URL(uriStr).openConnection() as HttpURLConnection
                conn.connectTimeout = 3000
                conn.readTimeout    = 3000
                conn.doInput = true
                conn.connect()
                BitmapFactory.decodeStream(conn.inputStream)
            }
            else -> null
        }
    } catch (_: Exception) { null }
}
