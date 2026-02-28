package com.parentalcontrol.agent.network

import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory
import com.parentalcontrol.agent.BuildConfig

object ApiClient {

    // Replace BASE_URL in build.gradle for production
    private val okhttp = OkHttpClient.Builder()
        .addInterceptor(HttpLoggingInterceptor().apply {
            level = HttpLoggingInterceptor.Level.BODY
        })
        .addInterceptor { chain ->
            val req = chain.request().newBuilder()
                .addHeader("X-Device-Token", com.parentalcontrol.agent.TokenStore.cachedToken)
                .build()
            chain.proceed(req)
        }
        .build()

    val service: ApiService by lazy {
        Retrofit.Builder()
            .baseUrl(BuildConfig.BASE_URL)
            .client(okhttp)
            .addConverterFactory(GsonConverterFactory.create())
            .build()
            .create(ApiService::class.java)
    }
}


