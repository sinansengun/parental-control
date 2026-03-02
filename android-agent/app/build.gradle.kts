plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.parentalcontrol.agent"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.parentalcontrol.agent"
        minSdk = 26
        targetSdk = 35
        versionCode = 1
        versionName = "1.0"
    }

    flavorDimensions += "env"
    productFlavors {
        create("emulator") {
            dimension = "env"
            buildConfigField("String", "BASE_URL", "\"http://10.0.2.2:8080/api/v1/\"")
        }
        create("device") {
            dimension = "env"
            // Bilgisayarının Wi-Fi IP'sini buraya yaz (ipconfig ile öğren)
            buildConfigField("String", "BASE_URL", "\"https://backend-production-17b0.up.railway.app/api/v1/\"")
        }
        create("production") {
            dimension = "env"
            buildConfigField("String", "BASE_URL", "\"https://backend-production-17b0.up.railway.app/api/v1/\"")
        }
    }

    buildFeatures {
        buildConfig = true
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
}

dependencies {
    // Networking
    implementation("com.squareup.retrofit2:retrofit:2.9.0")
    implementation("com.squareup.retrofit2:converter-gson:2.9.0")
    implementation("com.squareup.okhttp3:logging-interceptor:4.12.0")

    // Background work
    implementation("androidx.work:work-runtime-ktx:2.9.0")

    // Location
    implementation("com.google.android.gms:play-services-location:21.2.0")

    // Coroutines
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.7.3")

    // DataStore (token storage)
    implementation("androidx.datastore:datastore-preferences:1.0.0")

    // UI
    implementation("androidx.appcompat:appcompat:1.6.1")
    implementation("com.google.android.material:material:1.11.0")
    implementation("androidx.constraintlayout:constraintlayout:2.1.4")

    // LocalBroadcastManager (AppLog UI updates)
    implementation("androidx.localbroadcastmanager:localbroadcastmanager:1.1.0")
}
