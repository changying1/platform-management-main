package com.app.myapplication.data.local;

import android.content.Context;
import android.content.SharedPreferences;

public class AppConfig {
    private static final String DEFAULT_BASE_URL = "http://10.0.2.2:9000/";

    public static String getBaseUrl(Context ctx) {
        String url = DEFAULT_BASE_URL.trim();
        if (!url.endsWith("/")) url += "/";
        return url;
    }

    public static void setBaseUrl(Context ctx, String baseUrl) {
        // 不提供设置能力，留空或删除
    }
}


