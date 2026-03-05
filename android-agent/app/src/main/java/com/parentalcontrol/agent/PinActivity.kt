package com.parentalcontrol.agent

import android.content.Intent
import android.os.Bundle
import android.view.View
import android.widget.Button
import android.widget.ProgressBar
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import com.parentalcontrol.agent.network.ApiClient
import com.parentalcontrol.agent.network.VerifyPinRequest
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/**
 * PIN entry screen shown on every fresh app open when the device has a PIN set.
 * After a correct PIN is entered, [TokenStore.pinVerified] is set to true and
 * the user proceeds to [MainActivity].
 */
class PinActivity : AppCompatActivity() {

    private val entered = StringBuilder()
    private lateinit var tvDots: TextView
    private lateinit var tvError: TextView
    private lateinit var progress: ProgressBar

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_pin)

        tvDots   = findViewById(R.id.tvPinDots)
        tvError  = findViewById(R.id.tvError)
        progress = findViewById(R.id.progressBar)

        val digits = listOf(
            R.id.btn0, R.id.btn1, R.id.btn2, R.id.btn3, R.id.btn4,
            R.id.btn5, R.id.btn6, R.id.btn7, R.id.btn8, R.id.btn9
        )
        digits.forEachIndexed { index, id ->
            findViewById<Button>(id).setOnClickListener { appendDigit(index.toString()) }
        }
        // btn0 is at index 0 but text "0"
        // The forEachIndexed maps: btn0=0,btn1=1,...btn9=9 based on id list order — matches digits
        // Actually btn0 is R.id.btn0 at index 0 → appendDigit("0") ✓

        findViewById<Button>(R.id.btnClear).setOnClickListener { deleteDigit() }
        findViewById<Button>(R.id.btnOk).setOnClickListener { submitPin() }
    }

    /** Prevent back-press from bypassing the PIN screen. */
    override fun onBackPressed() {
        // Do nothing — user must enter PIN
    }

    private fun appendDigit(d: String) {
        if (entered.length >= 4) return
        entered.append(d)
        tvError.text = ""
        updateDots()
        // Auto-submit when 4 digits have been entered
        if (entered.length == 4) submitPin()
    }

    private fun deleteDigit() {
        if (entered.isNotEmpty()) entered.deleteCharAt(entered.lastIndex)
        tvError.text = ""
        updateDots()
    }

    private fun updateDots() {
        val filled  = entered.length
        val display = "●".repeat(filled) + "○".repeat((4 - filled).coerceAtLeast(0))
        tvDots.text = display
    }

    private fun submitPin() {
        val pin = entered.toString()
        if (pin.length < 4) {
            tvError.text = "Enter 4 digits."
            return
        }

        setLoading(true)
        CoroutineScope(Dispatchers.IO).launch {
            val ok = try {
                val resp = ApiClient.service.verifyPin(VerifyPinRequest(pin))
                resp.isSuccessful
            } catch (e: Exception) {
                false
            }
            withContext(Dispatchers.Main) {
                setLoading(false)
                if (ok) {
                    TokenStore.pinVerified = true
                    startActivity(
                        Intent(this@PinActivity, MainActivity::class.java)
                            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK)
                    )
                } else {
                    tvError.text = "Incorrect PIN. Try again."
                    entered.clear()
                    updateDots()
                }
            }
        }
    }

    private fun setLoading(loading: Boolean) {
        progress.visibility = if (loading) View.VISIBLE else View.GONE
        findViewById<Button>(R.id.btnOk).isEnabled = !loading
    }
}
