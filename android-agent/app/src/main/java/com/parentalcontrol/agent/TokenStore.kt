package com.parentalcontrol.agent

import android.content.Context
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map

val Context.dataStore by preferencesDataStore(name = "parental_prefs")

object TokenStore {

    private val KEY_DEVICE_TOKEN = stringPreferencesKey("device_token")

    /** In-memory cache — used by OkHttp interceptor (sync context). */
    var cachedToken: String = ""
        private set

    /**
     * True once the user has successfully entered the PIN this session.
     * Reset to false when the process is killed (app force-closed or rebooted).
     */
    var pinVerified: Boolean = false

    suspend fun saveToken(context: Context, token: String) {
        context.dataStore.edit { prefs ->
            prefs[KEY_DEVICE_TOKEN] = token
        }
        cachedToken = token
    }

    suspend fun loadToken(context: Context): String {
        val token = context.dataStore.data
            .map { prefs -> prefs[KEY_DEVICE_TOKEN] ?: "" }
            .first()
        cachedToken = token
        return token
    }

    suspend fun hasToken(context: Context): Boolean = loadToken(context).isNotEmpty()

    fun clearCache() {
        cachedToken = ""
    }
}
