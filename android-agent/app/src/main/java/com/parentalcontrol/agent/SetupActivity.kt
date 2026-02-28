package com.parentalcontrol.agent

import android.content.Intent
import android.os.Bundle
import android.view.View
import android.widget.Button
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import com.google.android.material.textfield.TextInputEditText
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/**
 * First-launch screen where the parent enters the device token
 * generated from the dashboard (POST /api/v1/dashboard/devices).
 */
class SetupActivity : AppCompatActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_setup)

        val etToken   = findViewById<TextInputEditText>(R.id.etToken)
        val btnActivate = findViewById<Button>(R.id.btnActivate)
        val tvError   = findViewById<TextView>(R.id.tvError)

        btnActivate.setOnClickListener {
            val token = etToken.text?.toString()?.trim() ?: ""
            if (token.isEmpty()) {
                tvError.text = "Please enter the device token."
                return@setOnClickListener
            }

            btnActivate.isEnabled = false
            tvError.text = ""

            CoroutineScope(Dispatchers.IO).launch {
                TokenStore.saveToken(applicationContext, token)
                withContext(Dispatchers.Main) {
                    // Navigate to main screen and clear back stack
                    startActivity(
                        Intent(this@SetupActivity, MainActivity::class.java)
                            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK)
                    )
                }
            }
        }
    }
}
