package com.app.myapplication.ui.alarm;

import android.content.Context;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;

import androidx.annotation.NonNull;

import com.app.myapplication.data.local.AppConfig;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.WebSocket;
import okhttp3.WebSocketListener;

public class AlarmWebSocketClient {
    private static final String TAG = "AlarmWebSocketClient";

    public interface Listener {
        void onAlarmMessage(String alarmType, String description);
    }

    private final OkHttpClient client = new OkHttpClient();
    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private WebSocket webSocket;

    public void connect(Context context, Listener listener) {
        close();
        String wsUrl = toWsUrl(AppConfig.getBaseUrl(context)) + "ws/alarm";
        Request request = new Request.Builder().url(wsUrl).build();
        webSocket = client.newWebSocket(request, new WebSocketListener() {
            @Override
            public void onMessage(@NonNull WebSocket webSocket, @NonNull String text) {
                AlarmPayload payload = parsePayload(text);
                mainHandler.post(() -> listener.onAlarmMessage(payload.alarmType, payload.description));
            }

            @Override
            public void onFailure(@NonNull WebSocket webSocket, @NonNull Throwable t, okhttp3.Response response) {
                Log.w(TAG, "alarm websocket failed: " + (t == null ? "" : t.getMessage()));
            }
        });
    }

    public void close() {
        if (webSocket != null) {
            webSocket.close(1000, "closed");
            webSocket = null;
        }
    }

    private AlarmPayload parsePayload(String text) {
        AlarmPayload payload = new AlarmPayload();
        try {
            JsonObject root = JsonParser.parseString(text).getAsJsonObject();
            JsonObject alarm = root.has("data") && root.get("data").isJsonObject()
                    ? root.getAsJsonObject("data")
                    : root;
            payload.alarmType = firstString(alarm, "alarm_type", "alarmType", "type");
            payload.description = firstString(alarm, "description", "msg", "message");
        } catch (Exception e) {
            Log.w(TAG, "failed to parse alarm websocket message", e);
        }
        return payload;
    }

    private String firstString(JsonObject obj, String... keys) {
        if (obj == null) return "";
        for (String key : keys) {
            if (!obj.has(key) || obj.get(key).isJsonNull()) continue;
            String value = obj.get(key).getAsString();
            if (value != null && !value.trim().isEmpty()) return value.trim();
        }
        return "";
    }

    private String toWsUrl(String baseUrl) {
        String url = baseUrl == null ? "" : baseUrl.trim();
        if (url.startsWith("https://")) return "wss://" + url.substring("https://".length());
        if (url.startsWith("http://")) return "ws://" + url.substring("http://".length());
        return url;
    }

    private static class AlarmPayload {
        String alarmType = "";
        String description = "";
    }
}
