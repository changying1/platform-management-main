import java.util.Properties

plugins {
    alias(libs.plugins.android.application)
}

val localProperties = Properties().apply {
    val file = rootProject.file("local.properties")
    if (file.exists()) {
        file.inputStream().use { load(it) }
    }
}

val ezvizAppKey = providers.gradleProperty("EZVIZ_APP_KEY")
    .orElse(localProperties.getProperty("EZVIZ_APP_KEY") ?: "")
    .get()

val useHlsDebugStream = providers.gradleProperty("USE_HLS_DEBUG_STREAM")
    .orElse(localProperties.getProperty("USE_HLS_DEBUG_STREAM") ?: "false")
    .get()
    .toBooleanStrictOrNull() ?: false

android {
    namespace = "com.app.myapplication"
    compileSdk = 36

    defaultConfig {
        applicationId = "com.app.myapplication"
        minSdk = 23
        targetSdk = 36
        versionCode = 1
        versionName = "1.0"
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
        buildConfigField("String", "EZVIZ_APP_KEY", "\"${ezvizAppKey.replace("\\", "\\\\").replace("\"", "\\\"")}\"")
        buildConfigField("boolean", "USE_HLS_DEBUG_STREAM", useHlsDebugStream.toString())
        manifestPlaceholders["EZVIZ_APP_KEY"] = ezvizAppKey
        if (!useHlsDebugStream) {
            ndk {
                abiFilters += listOf("armeabi-v7a")
            }
        }
    }

    buildFeatures {
        buildConfig = true
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_11
        targetCompatibility = JavaVersion.VERSION_11
    }

    splits {
        abi {
            isEnable = !useHlsDebugStream
            reset()
            include("armeabi-v7a")
            isUniversalApk = false
        }
    }

    packaging {
        jniLibs {
            if (useHlsDebugStream) {
                excludes += "**/armeabi-v7a/*.so"
            }
        }
    }
}

dependencies {
    implementation(libs.appcompat)
    implementation(libs.activity)
    implementation(libs.constraintlayout)
    implementation(libs.play.services.basement)
    implementation("com.google.android.material:material:1.12.0")

    testImplementation(libs.junit)
    androidTestImplementation(libs.ext.junit)
    androidTestImplementation(libs.espresso.core)

    implementation("androidx.recyclerview:recyclerview:1.3.2")
    implementation("androidx.lifecycle:lifecycle-viewmodel:2.8.7")
    implementation("androidx.lifecycle:lifecycle-livedata:2.8.7")
    implementation("androidx.preference:preference:1.2.1")

    implementation("com.squareup.retrofit2:retrofit:2.11.0")
    implementation("com.squareup.retrofit2:converter-gson:2.11.0")
    implementation("com.squareup.okhttp3:okhttp:4.12.0")
    implementation("com.squareup.okhttp3:logging-interceptor:4.12.0")

    implementation("androidx.media3:media3-exoplayer:1.4.1")
    implementation("androidx.media3:media3-exoplayer-hls:1.4.1")
    implementation("androidx.media3:media3-ui:1.4.1")

    implementation("com.amap.api:3dmap:9.8.3")
    implementation("org.osmdroid:osmdroid-android:6.1.17")

    implementation("com.hikvision.ezviz:ezviz-sdk:4.8.0")
    implementation(fileTree(mapOf("dir" to "libs", "include" to listOf("*.jar", "*.aar"))))

    // Agora voice RTC for app group voice calls
    implementation("io.agora.rtc:voice-sdk:4.6.3")
}
