package com.app.myapplication.data.local;

import android.content.Context;

public class AppConfig {
    private static final String PREFS = "app_config";
    private static final String KEY_BASE_URL = "base_url";
    // Android emulator can use 10.0.2.2 to reach the host machine.
    // For a physical phone, replace this with the computer LAN IP or server address.
    private static final String DEFAULT_BASE_URL = "http://10.0.2.2:9000/";

    public static String getBaseUrl(Context ctx) {
        String saved = ctx.getApplicationContext()
                .getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                .getString(KEY_BASE_URL, DEFAULT_BASE_URL);
        String url = (saved == null || saved.trim().isEmpty() ? DEFAULT_BASE_URL : saved).trim();
        if (!url.endsWith("/")) url += "/";
        return url;
    }

    public static void setBaseUrl(Context ctx, String baseUrl) {
        String value = baseUrl == null ? "" : baseUrl.trim();
        if (!value.isEmpty() && !value.endsWith("/")) value += "/";
        ctx.getApplicationContext()
                .getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                .edit()
                .putString(KEY_BASE_URL, value.isEmpty() ? DEFAULT_BASE_URL : value)
                .apply();
    }

    public static String toAbsoluteUrl(Context ctx, String pathOrUrl) {
        if (pathOrUrl == null) return "";
        String value = pathOrUrl.trim();
        if (value.isEmpty()) return "";

        String lower = value.toLowerCase();
        if (lower.startsWith("http://")
                || lower.startsWith("https://")
                || lower.startsWith("rtsp://")
                || lower.startsWith("rtmp://")
                || lower.startsWith("webrtc://")) {
            return rewriteEmulatorMediaUrl(value);
        }

        String base = getBaseUrl(ctx);
        if (base.endsWith("/") && value.startsWith("/")) {
            return base.substring(0, base.length() - 1) + value;
        }
        if (!base.endsWith("/") && !value.startsWith("/")) {
            return base + "/" + value;
        }
        return base + value;
    }

    private static String rewriteEmulatorMediaUrl(String url) {
        String lower = url.toLowerCase();
        boolean isLocalNms = lower.startsWith("http://127.0.0.1:8001/")
                || lower.startsWith("http://localhost:8001/");
        boolean looksLikeMedia = lower.contains("/live/")
                || lower.contains("/static/")
                || lower.endsWith(".flv")
                || lower.endsWith(".m3u8")
                || lower.endsWith(".mp4");
        if (!isLocalNms || !looksLikeMedia) {
            return url;
        }

        // Emulator-only development rewrite. Physical devices and production builds
        // should receive a LAN IP or public server URL from the backend instead.
        if (lower.startsWith("http://127.0.0.1:8001/")) {
            return "http://10.0.2.2:8001/" + url.substring("http://127.0.0.1:8001/".length());
        }
        return "http://10.0.2.2:8001/" + url.substring("http://localhost:8001/".length());
    }
}
