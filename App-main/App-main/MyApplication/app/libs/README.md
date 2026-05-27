Fallback only: place the official EZVIZ Android SDK AAR/JAR files in this directory
if Gradle cannot resolve com.hikvision.ezviz:ezviz-sdk:4.8.0.

Expected source: EZVIZ Open Platform Android SDK download package.
Do not commit appSecret here. If the SDK requires appKey initialization, provide it through
non-hardcoded build/environment configuration and keep appSecret on the backend.

App key configuration:

Add the app key to local.properties or pass it as a Gradle property:

EZVIZ_APP_KEY=your_ezviz_app_key

The app reads it through BuildConfig.EZVIZ_APP_KEY and the Android manifest placeholder
named EZVIZ_APP_KEY. Never put appSecret in the app.

Official 4.x SDK note: native libraries may only support armeabi-v7a, so x86/x86_64
emulators are not suitable for final playback verification. Prefer a real ARM device.
