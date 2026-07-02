package com.app.myapplication.data.local;

import android.content.Context;

public class AppConfig {
    private static final String PREFS = "app_config";
    private static final String KEY_BASE_URL = "base_url";
    // Android emulator can use 10.0.2.2 to reach the host machine.
    // For a physical phone, replace this with the computer LAN IP or server address.
    private static final String DEFAULT_BASE_URL = "http://220.185.189.50:43862/";

    public static String getBaseUrl(Context ctx) {
        Context appCtx = ctx.getApplicationContext();
        String saved = appCtx
                .getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                .getString(KEY_BASE_URL, DEFAULT_BASE_URL);
        String url = normalizeBaseUrl(saved);
        if (!url.equals(saved)) {
            appCtx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                    .edit()
                    .putString(KEY_BASE_URL, url)
                    .apply();
        }
        return url;
    }

    public static void setBaseUrl(Context ctx, String baseUrl) {
        String value = normalizeBaseUrl(baseUrl);
        ctx.getApplicationContext()
                .getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                .edit()
                .putString(KEY_BASE_URL, value)
                .apply();
    }

    private static String normalizeBaseUrl(String raw) {
        String value = raw == null ? "" : raw.trim();
        if (value.isEmpty()) {
            value = DEFAULT_BASE_URL;
        }
        value = value.replace('\\', '/').replaceAll("\\s+", "");

        // Recover from values such as "www.xxx.nyat.app/220.185.189.50:43862".
        int firstSlash = value.indexOf('/');
        if (firstSlash > 0
                && !value.regionMatches(true, 0, "http://", 0, "http://".length())
                && !value.regionMatches(true, 0, "https://", 0, "https://".length())) {
            String pathLikeHost = value.substring(firstSlash + 1);
            if (looksLikeHostPort(pathLikeHost)) {
                value = pathLikeHost;
            }
        }

        if (!value.regionMatches(true, 0, "http://", 0, "http://".length())
                && !value.regionMatches(true, 0, "https://", 0, "https://".length())) {
            value = "http://" + value;
        }

        int schemeEnd = value.indexOf("://");
        int pathStart = schemeEnd >= 0 ? value.indexOf('/', schemeEnd + 3) : -1;
        if (pathStart > 0) {
            String host = value.substring(schemeEnd + 3, pathStart);
            String path = value.substring(pathStart + 1);
            if (looksLikeHostPort(path)) {
                value = value.substring(0, schemeEnd + 3) + path;
            } else if (!path.isEmpty() && !path.startsWith("api")) {
                value = value.substring(0, pathStart);
            }
        }

        if (!value.endsWith("/")) value += "/";
        return value;
    }

    private static boolean looksLikeHostPort(String value) {
        if (value == null) return false;
        String trimmed = value.trim();
        return trimmed.matches("(?i)^([a-z0-9.-]+|\\d{1,3}(\\.\\d{1,3}){3}):\\d{2,5}/?$");
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
