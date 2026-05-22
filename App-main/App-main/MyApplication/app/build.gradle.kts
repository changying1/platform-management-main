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

android {
    namespace = "com.app.myapplication"
    compileSdk = 36   // ✅ 这样写

    defaultConfig {
        applicationId = "com.app.myapplication"
        minSdk = 23
        targetSdk = 36
        versionCode = 1
        versionName = "1.0"
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
        buildConfigField("String", "EZVIZ_APP_KEY", "\"${ezvizAppKey.replace("\\", "\\\\").replace("\"", "\\\"")}\"")
        manifestPlaceholders["EZVIZ_APP_KEY"] = ezvizAppKey
        ndk {
            abiFilters += listOf("armeabi-v7a")
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
}

dependencies {
    implementation(libs.appcompat)
//    implementation(libs.material) // ✅ 保留这一行，就删掉下面手写 material
    implementation(libs.activity)
    implementation(libs.constraintlayout)
    implementation(libs.play.services.basement)

    testImplementation(libs.junit)
    androidTestImplementation(libs.ext.junit)
    androidTestImplementation(libs.espresso.core)

    // ❌ 删掉重复的这一行：
    implementation("com.google.android.material:material:1.12.0")

    // RecyclerView
    implementation("androidx.recyclerview:recyclerview:1.3.2")

    // MVVM
    implementation("androidx.lifecycle:lifecycle-viewmodel:2.8.6")
    implementation("androidx.lifecycle:lifecycle-livedata:2.8.6")

    // Retrofit + OkHttp
    implementation("com.squareup.retrofit2:retrofit:2.11.0")
    implementation("com.squareup.retrofit2:converter-gson:2.11.0")
    implementation("com.squareup.okhttp3:okhttp:4.12.0")
    implementation("com.squareup.okhttp3:logging-interceptor:4.12.0")

    // Media3 ExoPlayer
    implementation("androidx.media3:media3-exoplayer:1.4.1")
    implementation("androidx.media3:media3-exoplayer-hls:1.4.1")
    implementation("androidx.media3:media3-ui:1.4.1")

    // 高德地图
    implementation("com.amap.api:3dmap:9.8.3")
// Retrofit + OkHttp + Gson
    implementation("com.squareup.retrofit2:retrofit:2.11.0")
    implementation("com.squareup.retrofit2:converter-gson:2.11.0")
    implementation("com.squareup.okhttp3:okhttp:4.12.0")
    implementation("com.squareup.okhttp3:logging-interceptor:4.12.0")

    // Lifecycle (ViewModel + LiveData)
    implementation("androidx.lifecycle:lifecycle-viewmodel:2.8.7")
    implementation("androidx.lifecycle:lifecycle-livedata:2.8.7")

    // RecyclerView（一般你已有）
    implementation("androidx.recyclerview:recyclerview:1.3.2")
    implementation("androidx.preference:preference:1.2.1")

    // osmdroid 地图库
    implementation("org.osmdroid:osmdroid-android:6.1.17")

    // Official EZVIZ Android SDK from EZVIZ Open Platform docs.
    implementation("com.hikvision.ezviz:ezviz-sdk:4.8.0")

    // Fallback only: put official EZOpenSDK AAR/JAR files under app/libs if Maven is unavailable.
    implementation(fileTree(mapOf("dir" to "libs", "include" to listOf("*.jar", "*.aar"))))
}
