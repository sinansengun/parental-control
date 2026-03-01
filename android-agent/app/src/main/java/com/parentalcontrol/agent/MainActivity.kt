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
                initMainScreen()
            }
        }
    }

    private fun initMainScreen() {
        setContentView(R.layout.activity_main)

        val tvStatus      = findViewById<TextView>(R.id.tvStatus)
        val tvDeviceToken = findViewById<TextView>(R.id.tvDeviceToken)
        val btnActivate   = findViewById<Button>(R.id.btnActivate)
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

        btnAccessibility.setOnClickListener {
            startActivity(Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS))
        }

        // Update button label based on current state
        if (isNotificationListenerEnabled()) {
            btnAccessibility.text = "WhatsApp Notifications ✓"
        }

        // Bind log views
        tvLog     = findViewById(R.id.tvLog)
        scrollLog = findViewById(R.id.scrollLog)
        refreshLog()
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
    }

    override fun onPause() {
        super.onPause()
        LocalBroadcastManager.getInstance(this).unregisterReceiver(logReceiver)
    }

    private fun isNotificationListenerEnabled(): Boolean {
        return NotificationManagerCompat.getEnabledListenerPackages(this)
            .contains(packageName)
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
