package com.parentalcontrol.agent

import android.Manifest
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.widget.Button
import android.widget.ScrollView
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.ActivityCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import androidx.localbroadcastmanager.content.LocalBroadcastManager
import androidx.work.*
import com.parentalcontrol.agent.service.LocationTrackingService
import com.parentalcontrol.agent.service.SyncWorker
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.util.concurrent.TimeUnit

class MainActivity : AppCompatActivity() {

    private val PERMISSIONS = arrayOf(
        Manifest.permission.ACCESS_FINE_LOCATION,
        Manifest.permission.READ_CALL_LOG,
        Manifest.permission.READ_SMS
    )
    private val PERM_CODE = 1001

    private var tvLog: TextView? = null
    private var scrollLog: ScrollView? = null

    private val logReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) {
            refreshLog()
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // PIN already verified this session → go straight to main screen
        if (TokenStore.pinVerified) {
            initMainScreen()
            return
        }

        // Check token first — if missing, go to setup
        CoroutineScope(Dispatchers.IO).launch {
            val hasToken = TokenStore.hasToken(applicationContext)
            withContext(Dispatchers.Main) {
                if (!hasToken) {
                    startActivity(
                        Intent(this@MainActivity, SetupActivity::class.java)
                            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK)
                    )
                    return@withContext
                }
                checkPinRequired()
            }
        }
    }

    /** Queries the backend to see if this device has a PIN, then routes accordingly. */
    private fun checkPinRequired() {
        CoroutineScope(Dispatchers.IO).launch {
            val hasPIN = try {
                val resp = com.parentalcontrol.agent.network.ApiClient.service.getDeviceStatus()
                resp.isSuccessful && resp.body()?.hasPIN == true
            } catch (e: Exception) {
                false // Network error → skip PIN to avoid locking user out
            }
            withContext(Dispatchers.Main) {
                if (hasPIN) {
                    startActivity(
                        Intent(this@MainActivity, PinActivity::class.java)
                            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK)
                    )
                } else {
                    TokenStore.pinVerified = true
                    initMainScreen()
                }
            }
        }
    }

    private fun initMainScreen() {
        setContentView(R.layout.activity_main)

        val tvStatus         = findViewById<TextView>(R.id.tvStatus)
        val tvDeviceToken    = findViewById<TextView>(R.id.tvDeviceToken)
        val btnActivate      = findViewById<Button>(R.id.btnActivate)
        val btnNotifications = findViewById<Button>(R.id.btnNotifications)
        val btnAccessibility = findViewById<Button>(R.id.btnAccessibility)

        // Show masked token for reference
        val token = TokenStore.cachedToken
        tvDeviceToken.text = if (token.length > 8)
            "Token: …${token.takeLast(8)}" else "Token: $token"

        btnActivate.setOnClickListener {
            if (hasPermissions()) {
                startMonitoring()
                tvStatus.text = "Monitoring Active ✓"
            } else {
                ActivityCompat.requestPermissions(this, PERMISSIONS, PERM_CODE)
            }
        }

        btnNotifications.setOnClickListener {
            startActivity(Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS))
        }

        btnAccessibility.setOnClickListener {
            startActivity(Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS))
        }

        // Update button labels based on current state
        if (isNotificationListenerEnabled()) {
            btnNotifications.text = "Notifications ✓"
        }
        if (isAccessibilityServiceEnabled()) {
            btnAccessibility.text = "Accessibility Service ✓"
        }

        // Bind log views
        tvLog     = findViewById(R.id.tvLog)
        scrollLog = findViewById(R.id.scrollLog)
        refreshLog()

        // Log startup info: backend URL, token tail
        val tokenTail = TokenStore.cachedToken.let {
            if (it.length > 8) "…${it.takeLast(8)}" else it
        }
        AppLog.add(this, "🚀 Başlatıldı — sunucu: ${BuildConfig.BASE_URL}")
        AppLog.add(this, "🔑 Token: $tokenTail")
    }

    private fun refreshLog() {
        val entries = AppLog.getAll()
        tvLog?.text = if (entries.isEmpty()) "No sync activity yet."
                      else entries.joinToString("\n")
        scrollLog?.post { scrollLog?.fullScroll(ScrollView.FOCUS_DOWN) }
    }

    override fun onResume() {
        super.onResume()
        LocalBroadcastManager.getInstance(this)
            .registerReceiver(logReceiver, IntentFilter(AppLog.ACTION_LOG_UPDATED))
        refreshLog()
        // Update button states when returning from Settings
        findViewById<Button>(R.id.btnNotifications)?.text =
            if (isNotificationListenerEnabled()) "Notifications \u2713" else "Enable Notifications"
        findViewById<Button>(R.id.btnAccessibility)?.text =
            if (isAccessibilityServiceEnabled()) "Accessibility Service \u2713" else "Enable Accessibility Service"
    }

    override fun onPause() {
        super.onPause()
        LocalBroadcastManager.getInstance(this).unregisterReceiver(logReceiver)
    }

    private fun isNotificationListenerEnabled(): Boolean {
        return NotificationManagerCompat.getEnabledListenerPackages(this)
            .contains(packageName)
    }

    private fun isAccessibilityServiceEnabled(): Boolean {
        val enabled = Settings.Secure.getString(
            contentResolver, Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES
        ) ?: return false
        val parts = enabled.split(':')
        val whatsapp = "$packageName/com.parentalcontrol.agent.service.WhatsAppAccessibilityService"
        val browser  = "$packageName/com.parentalcontrol.agent.service.BrowserMonitorService"
        return parts.any { it.equals(whatsapp, ignoreCase = true) } ||
               parts.any { it.equals(browser,  ignoreCase = true) }
    }

    private fun hasPermissions() = PERMISSIONS.all {
        ContextCompat.checkSelfPermission(this, it) == PackageManager.PERMISSION_GRANTED
    }

    private fun startMonitoring() {
        // Start foreground location service
        val serviceIntent = Intent(this, LocationTrackingService::class.java)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            startForegroundService(serviceIntent)
        } else {
            startService(serviceIntent)
        }

        // Run an immediate one-time sync first
        val immediateSync = OneTimeWorkRequestBuilder<SyncWorker>()
            .setConstraints(Constraints.Builder()
                .setRequiredNetworkType(NetworkType.CONNECTED)
                .build())
            .build()
        WorkManager.getInstance(this).enqueue(immediateSync)

        // Schedule periodic call/SMS sync every 15 minutes
        val syncRequest = PeriodicWorkRequestBuilder<SyncWorker>(15, TimeUnit.MINUTES)
            .setConstraints(Constraints.Builder()
                .setRequiredNetworkType(NetworkType.CONNECTED)
                .build())
            .build()
        WorkManager.getInstance(this).enqueueUniquePeriodicWork(
            "data_sync",
            ExistingPeriodicWorkPolicy.KEEP,
            syncRequest
        )
    }

    override fun onRequestPermissionsResult(
        requestCode: Int, permissions: Array<String>, grantResults: IntArray
    ) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode == PERM_CODE && grantResults.all { it == PackageManager.PERMISSION_GRANTED }) {
            startMonitoring()
        } else {
            Toast.makeText(this, "All permissions are required", Toast.LENGTH_LONG).show()
        }
    }
}
