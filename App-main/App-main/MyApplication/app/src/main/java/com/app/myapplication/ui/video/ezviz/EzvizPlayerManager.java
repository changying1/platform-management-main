package com.app.myapplication.ui.video.ezviz;

import android.content.Context;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;
import android.os.Message;
import android.util.Log;
import android.view.SurfaceHolder;
import android.view.SurfaceView;
import android.view.ViewGroup;
import android.widget.FrameLayout;

import androidx.annotation.NonNull;

public class EzvizPlayerManager {
    private static final String TAG = "EzvizPlayerManager";

    public interface Callback {
        void onConnecting();

        void onPlaying();

        void onError(String message);
    }

    private final Context context;
    private final FrameLayout container;
    private final Callback callback;
    private final Handler playerHandler;

    private SurfaceView surfaceView;
    private Object player;
    private String pendingUrl;
    private String pendingToken;
    private String pendingDeviceSerial;
    private int pendingChannelNo;
    private boolean started;

    public EzvizPlayerManager(Context context, FrameLayout container, Callback callback) {
        this.context = context.getApplicationContext();
        this.container = container;
        this.callback = callback;
        this.playerHandler = new Handler(Looper.getMainLooper(), this::handlePlayerMessage);
    }

    public void start(String ezopenUrl, String accessToken, String deviceSerial, Integer channelNo) {
        stop();
        pendingUrl = safeTrim(ezopenUrl);
        pendingToken = safeTrim(accessToken);
        pendingDeviceSerial = firstNonEmpty(deviceSerial, parseDeviceSerial(pendingUrl));
        pendingChannelNo = channelNo == null || channelNo <= 0 ? parseChannelNo(pendingUrl) : channelNo;

        Log.i(TAG, "start ezviz real play: url=" + pendingUrl
                + ", deviceSerial=" + pendingDeviceSerial
                + ", channelNo=" + pendingChannelNo
                + ", hasAccessToken=" + !pendingToken.isEmpty());

        if (pendingUrl.isEmpty() || !pendingUrl.toLowerCase().startsWith("ezopen://")) {
            notifyError("invalid ezopen url");
            return;
        }
        if (pendingToken.isEmpty()) {
            notifyError("backend access_token is empty");
            return;
        }
        if (pendingDeviceSerial.isEmpty() || pendingChannelNo <= 0) {
            notifyError("missing device_serial or channel_no");
            return;
        }
        if (!EzvizSdkBridge.isReady()) {
            notifyError(EzvizSdkBridge.getInitStatus());
            return;
        }

        if (callback != null) callback.onConnecting();
        surfaceView = new SurfaceView(context);
        container.removeAllViews();
        container.addView(surfaceView, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
        ));
        surfaceView.getHolder().addCallback(new SurfaceHolder.Callback() {
            @Override
            public void surfaceCreated(@NonNull SurfaceHolder holder) {
                startWithSurface(holder);
            }

            @Override
            public void surfaceChanged(@NonNull SurfaceHolder holder, int format, int width, int height) {
            }

            @Override
            public void surfaceDestroyed(@NonNull SurfaceHolder holder) {
                stop();
            }
        });
    }

    public void pause() {
        stop();
    }

    public void resume() {
        if (!started && pendingUrl != null) {
            start(pendingUrl, pendingToken, pendingDeviceSerial, pendingChannelNo);
        }
    }

    public void stop() {
        started = false;
        if (player != null) {
            Log.i(TAG, "stop ezviz real play");
            EzvizSdkBridge.stopRealPlay(player);
            EzvizSdkBridge.releasePlayer(player);
            player = null;
        }
        if (surfaceView != null) {
            ViewGroup parent = (ViewGroup) surfaceView.getParent();
            if (parent != null) parent.removeView(surfaceView);
            surfaceView = null;
        }
    }

    public void release() {
        stop();
        container.removeAllViews();
    }

    public boolean isStarted() {
        return started;
    }

    private void startWithSurface(SurfaceHolder holder) {
        try {
            EzvizSdkBridge.setAccessToken(pendingToken);
            Log.i(TAG, "EZVIZ access token set from backend response");
            player = EzvizSdkBridge.createPlayer(pendingDeviceSerial, pendingChannelNo);
            Log.i(TAG, "EZVIZ player created");
            EzvizSdkBridge.setHandler(player, playerHandler);
            if (!EzvizSdkBridge.setSurfaceHolder(player, holder)) {
                notifyError("setSurfaceHold failed");
                return;
            }
            if (!EzvizSdkBridge.startRealPlay(player)) {
                notifyError("startRealPlay returned false");
                return;
            }
            started = true;
            Log.i(TAG, "EZVIZ startRealPlay invoked");
            if (callback != null) callback.onPlaying();
        } catch (Exception e) {
            notifyError("startRealPlay failed: " + EzvizSdkBridge.rootMessage(e));
        }
    }

    private boolean handlePlayerMessage(Message message) {
        if (message == null) return true;
        Log.i(TAG, "EZVIZ player message: what=" + message.what + ", arg1=" + message.arg1 + ", arg2=" + message.arg2);
        if (message.what < 0) {
            notifyError("player message error: " + message.what);
        }
        return true;
    }

    private void notifyError(String message) {
        started = false;
        Log.w(TAG, "EZVIZ play error: " + message);
        if (callback != null) callback.onError(message);
    }

    private static String parseDeviceSerial(String ezopenUrl) {
        try {
            Uri uri = Uri.parse(ezopenUrl);
            return safeTrim(uri.getPathSegments().isEmpty() ? "" : uri.getPathSegments().get(0));
        } catch (Exception e) {
            return "";
        }
    }

    private static int parseChannelNo(String ezopenUrl) {
        try {
            Uri uri = Uri.parse(ezopenUrl);
            if (uri.getPathSegments().size() < 2) return 1;
            String channelSegment = uri.getPathSegments().get(1);
            int dotIndex = channelSegment.indexOf('.');
            String raw = dotIndex >= 0 ? channelSegment.substring(0, dotIndex) : channelSegment;
            return Integer.parseInt(raw);
        } catch (Exception e) {
            return 1;
        }
    }

    private static String firstNonEmpty(String first, String second) {
        String value = safeTrim(first);
        return value.isEmpty() ? safeTrim(second) : value;
    }

    private static String safeTrim(String value) {
        return value == null ? "" : value.trim();
    }
}
