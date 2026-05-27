package com.app.myapplication.ui.call;

import android.content.Context;
import android.text.TextUtils;

import com.app.myapplication.data.local.AppConfig;
import com.app.myapplication.data.model.call.AppVoiceRoom;
import com.google.gson.Gson;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.Response;
import okhttp3.WebSocket;
import okhttp3.WebSocketListener;

public class AppVoiceCallSocket {
    public interface Listener {
        void onInvite(AppVoiceRoom room);
        void onDisconnected();
    }

    private final OkHttpClient client = new OkHttpClient();
    private final Gson gson = new Gson();
    private WebSocket webSocket;
    private String connectedUserId;
    private Listener currentListener;

    public void connect(Context context, String userId, Listener listener) {
        if (TextUtils.isEmpty(userId)) {
            close();
            return;
        }
        currentListener = listener;
        if (webSocket != null && TextUtils.equals(connectedUserId, userId)) {
            return;
        }
        close();

        connectedUserId = userId;
        String wsUrl = toWsUrl(AppConfig.getBaseUrl(context)) + "ws/app/call/voice/" + userId;
        Request request = new Request.Builder().url(wsUrl).build();
        webSocket = client.newWebSocket(request, new WebSocketListener() {
            @Override
            public void onMessage(WebSocket webSocket, String text) {
                AppVoiceRoom room = parseInviteRoom(text);
                if (room != null && currentListener != null) {
                    currentListener.onInvite(room);
                }
            }

            @Override
            public void onFailure(WebSocket webSocket, Throwable t, Response response) {
                markDisconnected(webSocket);
                if (currentListener != null) {
                    currentListener.onDisconnected();
                }
            }

            @Override
            public void onClosed(WebSocket webSocket, int code, String reason) {
                markDisconnected(webSocket);
                if (currentListener != null) {
                    currentListener.onDisconnected();
                }
            }
        });
    }

    public void close() {
        if (webSocket != null) {
            webSocket.close(1000, "closed");
            webSocket = null;
        }
        connectedUserId = null;
    }

    private void markDisconnected(WebSocket socket) {
        if (webSocket == socket) {
            webSocket = null;
            connectedUserId = null;
        }
    }

    private AppVoiceRoom parseInviteRoom(String text) {
        try {
            JsonObject root = JsonParser.parseString(text).getAsJsonObject();
            String type = root.has("type") ? root.get("type").getAsString() : "";
            if (!"call_invite".equals(type)) {
                return null;
            }
            JsonObject data = root.has("data") && root.get("data").isJsonObject()
                    ? root.getAsJsonObject("data")
                    : null;
            if (data == null || !data.has("room") || !data.get("room").isJsonObject()) {
                return null;
            }
            return gson.fromJson(data.getAsJsonObject("room"), AppVoiceRoom.class);
        } catch (Exception ignored) {
            return null;
        }
    }

    private String toWsUrl(String baseUrl) {
        String url = baseUrl == null ? "" : baseUrl.trim();
        if (url.startsWith("https://")) {
            url = "wss://" + url.substring("https://".length());
        } else if (url.startsWith("http://")) {
            url = "ws://" + url.substring("http://".length());
        }
        if (!url.endsWith("/")) {
            url += "/";
        }
        return url;
    }
}
