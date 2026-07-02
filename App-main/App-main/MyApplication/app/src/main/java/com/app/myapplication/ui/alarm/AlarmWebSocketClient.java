package com.app.myapplication.ui.alarm;

import android.content.Context;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;

import androidx.annotation.NonNull;

import com.app.myapplication.data.local.AppConfig;
import com.app.myapplication.data.local.SessionManager;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.WebSocket;
import okhttp3.WebSocketListener;

public class AlarmWebSocketClient {
    private static final String TAG = "AlarmWebSocketClient";

    public interface Listener {
        void onAlarmMessage(AlarmPayload payload);
    }

    private final OkHttpClient client = new OkHttpClient();
    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private WebSocket webSocket;

    public void connect(Context context, Listener listener) {
        close();
        String wsUrl = toWsUrl(AppConfig.getBaseUrl(context)) + "ws/alarm";
        Request.Builder requestBuilder = new Request.Builder().url(wsUrl);
        String auth = new SessionManager(context.getApplicationContext()).getAuthorizationHeader();
        if (!auth.isEmpty()) {
            requestBuilder.header("Authorization", auth);
        }
        Request request = requestBuilder.build();
        webSocket = client.newWebSocket(request, new WebSocketListener() {
            @Override
            public void onMessage(@NonNull WebSocket webSocket, @NonNull String text) {
                AlarmPayload payload = parsePayload(text);
                mainHandler.post(() -> listener.onAlarmMessage(payload));
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
            payload.id = firstLong(alarm, "id", "alarm_id", "alarmId");
            payload.alarmType = firstString(alarm, "alarm_type", "alarmType", "type");
            payload.severity = firstString(alarm, "severity", "level", "alarm_level", "alarmLevel");
            payload.description = firstString(alarm, "description", "msg", "message");
            payload.deviceId = firstString(alarm, "device_id", "deviceId");
            payload.deviceName = firstString(alarm, "device_name", "deviceName", "device");
            payload.timestamp = firstString(alarm, "timestamp", "alarm_time", "alarmTime", "create_time");
            payload.location = firstString(alarm, "location", "position");
            payload.imageUrl = firstString(alarm, "alarm_image_path", "image_url", "imageUrl", "snapshot_url", "snapshotUrl", "image_path");
            payload.videoUrl = firstString(alarm, "boxed_video_url", "boxedVideoUrl", "annotated_video_url", "annotatedVideoUrl",
                    "alarm_video_url", "alarmVideoUrl", "alarm_video_path", "alarmVideoPath", "video_url", "videoUrl",
                    "clip_url", "clipUrl", "recording_path", "recordingPath");
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

    private long firstLong(JsonObject obj, String... keys) {
        if (obj == null) return 0L;
        for (String key : keys) {
            if (!obj.has(key) || obj.get(key).isJsonNull()) continue;
            try {
                return obj.get(key).getAsLong();
            } catch (Exception ignored) {
                try {
                    return Long.parseLong(obj.get(key).getAsString().trim());
                } catch (Exception ignoredAgain) {
                    // Try the next candidate.
                }
            }
        }
        return 0L;
    }

    private String toWsUrl(String baseUrl) {
        String url = baseUrl == null ? "" : baseUrl.trim();
        if (url.startsWith("https://")) return "wss://" + url.substring("https://".length());
        if (url.startsWith("http://")) return "ws://" + url.substring("http://".length());
        return url;
    }

    public static class AlarmPayload {
        public long id = 0L;
        public String alarmType = "";
        public String severity = "";
        public String description = "";
        public String deviceId = "";
        public String deviceName = "";
        public String timestamp = "";
        public String location = "";
        public String imageUrl = "";
        public String videoUrl = "";
    }
}
