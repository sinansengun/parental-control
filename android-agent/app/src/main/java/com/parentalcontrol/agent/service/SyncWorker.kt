package com.parentalcontrol.agent.service

import android.content.Context
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.Canvas
import android.provider.CallLog
import android.util.Base64
import java.io.ByteArrayOutputStream
import android.provider.Telephony
import android.util.Log
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.parentalcontrol.agent.AppLog
import com.parentalcontrol.agent.TokenStore
import com.parentalcontrol.agent.network.ApiClient
import com.parentalcontrol.agent.network.CallLogEntry
import com.parentalcontrol.agent.network.InstalledAppEntry
import com.parentalcontrol.agent.network.SmsEntry

private const val TAG = "SyncWorker"

class SyncWorker(ctx: Context, params: WorkerParameters) : CoroutineWorker(ctx, params) {

    override suspend fun doWork(): Result {
        if (TokenStore.cachedToken.isEmpty()) {
            TokenStore.loadToken(applicationContext)
        }
        if (TokenStore.cachedToken.isEmpty()) {
            Log.w(TAG, "No device token, retrying later")
            return Result.retry()
        }
        Log.d(TAG, "Starting sync with token: ...${TokenStore.cachedToken.takeLast(6)}")

        return try {
            syncCallLogs()
            syncSms()
            syncInstalledApps()
            AppLog.add(applicationContext, "✓ Sync completed")
            Result.success()
        } catch (e: Exception) {
            Log.e(TAG, "Sync failed: ${e.message}", e)
            AppLog.add(applicationContext, "✗ Sync failed: ${e.message}")
            Result.retry()
        }
    }

    private suspend fun syncCallLogs() {
        val entries = mutableListOf<CallLogEntry>()
        val cursor = applicationContext.contentResolver.query(
            CallLog.Calls.CONTENT_URI,
            arrayOf(
                CallLog.Calls.NUMBER,
                CallLog.Calls.TYPE,
                CallLog.Calls.DATE,
                CallLog.Calls.DURATION,
                CallLog.Calls.CACHED_NAME
            ),
            null, null,
            "${CallLog.Calls.DATE} DESC"
        )
        cursor?.use {
            val numberIdx = it.getColumnIndex(CallLog.Calls.NUMBER)
            val typeIdx   = it.getColumnIndex(CallLog.Calls.TYPE)
            val dateIdx   = it.getColumnIndex(CallLog.Calls.DATE)
            val durIdx    = it.getColumnIndex(CallLog.Calls.DURATION)
            val nameIdx   = it.getColumnIndex(CallLog.Calls.CACHED_NAME)
            var count = 0
            while (it.moveToNext() && count < 100) {
                entries += CallLogEntry(
                    number   = it.getString(numberIdx) ?: "",
                    type     = it.getInt(typeIdx),
                    date     = it.getLong(dateIdx),
                    duration = it.getLong(durIdx),
                    name     = it.getString(nameIdx) ?: ""
                )
                count++
            }
        }
        if (entries.isNotEmpty()) {
            Log.d(TAG, "Sending ${entries.size} call log(s)")
            ApiClient.service.sendCallLogs(entries)
            Log.d(TAG, "Call logs sent OK")
            AppLog.add(applicationContext, "📞 ${entries.size} call(s) sent")
        } else {
            Log.d(TAG, "No call logs found on device")
        }
    }

    private suspend fun syncSms() {
        val entries = mutableListOf<SmsEntry>()
        val cursor = applicationContext.contentResolver.query(
            Telephony.Sms.CONTENT_URI,
            arrayOf(
                Telephony.Sms.ADDRESS,
                Telephony.Sms.BODY,
                Telephony.Sms.DATE,
                Telephony.Sms.TYPE
            ),
            null, null,
            "${Telephony.Sms.DATE} DESC"
        )
        cursor?.use {
            val addrIdx = it.getColumnIndex(Telephony.Sms.ADDRESS)
            val bodyIdx = it.getColumnIndex(Telephony.Sms.BODY)
            val dateIdx = it.getColumnIndex(Telephony.Sms.DATE)
            val typeIdx = it.getColumnIndex(Telephony.Sms.TYPE)
            var count = 0
            while (it.moveToNext() && count < 100) {
                entries += SmsEntry(
                    address = it.getString(addrIdx) ?: "",
                    body    = it.getString(bodyIdx) ?: "",
                    date    = it.getLong(dateIdx),
                    type    = it.getInt(typeIdx)
                )
                count++
            }
        }
        if (entries.isNotEmpty()) {
            Log.d(TAG, "Sending ${entries.size} SMS log(s)")
            ApiClient.service.sendSmsLogs(entries)
            Log.d(TAG, "SMS logs sent OK")
            AppLog.add(applicationContext, "💬 ${entries.size} SMS sent")
        } else {
            Log.d(TAG, "No SMS logs found on device")
        }
    }

    private suspend fun syncInstalledApps() {
        val pm = applicationContext.packageManager
        @Suppress("DEPRECATION")
        val packages = if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.TIRAMISU) {
            pm.getInstalledPackages(PackageManager.PackageInfoFlags.of(0))
        } else {
            pm.getInstalledPackages(0)
        }
        val entries = packages.mapNotNull { pkg ->
            try {
                @Suppress("DEPRECATION")
                val appInfo = if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.TIRAMISU) {
                    pm.getApplicationInfo(pkg.packageName, PackageManager.ApplicationInfoFlags.of(0))
                } else {
                    pkg.applicationInfo
                } ?: return@mapNotNull null

                // Skip pure system apps; allow system apps updated by user (FLAG_UPDATED_SYSTEM_APP)
                val isSystem  = (appInfo.flags and android.content.pm.ApplicationInfo.FLAG_SYSTEM) != 0
                val isUpdated = (appInfo.flags and android.content.pm.ApplicationInfo.FLAG_UPDATED_SYSTEM_APP) != 0
                if (isSystem && !isUpdated) return@mapNotNull null

                val label = appInfo.loadLabel(pm).toString()
                val iconBase64 = try {
                    val drawable = appInfo.loadIcon(pm)
                    val bmp = Bitmap.createBitmap(48, 48, Bitmap.Config.ARGB_8888)
                    val canvas = Canvas(bmp)
                    drawable.setBounds(0, 0, 48, 48)
                    drawable.draw(canvas)
                    val out = ByteArrayOutputStream()
                    bmp.compress(Bitmap.CompressFormat.PNG, 100, out)
                    Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP)
                } catch (e: Exception) { null }
                InstalledAppEntry(
                    packageName = pkg.packageName,
                    appName     = label,
                    version     = pkg.versionName ?: "",
                    installedAt = pkg.firstInstallTime,
                    iconBase64  = iconBase64
                )
            } catch (e: Exception) { null }
        }
        if (entries.isNotEmpty()) {
            Log.d(TAG, "Sending ${entries.size} installed app(s)")
            ApiClient.service.sendInstalledApps(entries)
            Log.d(TAG, "Installed apps sent OK")
            AppLog.add(applicationContext, "📦 ${entries.size} apps synced")
        }
    }
}
