package com.app.myapplication.ui.call.rtc;

import android.content.Context;

import io.agora.rtc2.ChannelMediaOptions;
import io.agora.rtc2.Constants;
import io.agora.rtc2.IRtcEngineEventHandler;
import io.agora.rtc2.RtcEngine;

public class AgoraRtcManager {
    public interface Listener {
        void onJoinSuccess(String channel, int uid);
        void onUserJoined(int uid);
        void onUserOffline(int uid);
        void onError(String message);
    }

    private RtcEngine engine;
    private Listener listener;

    public void setListener(Listener listener) {
        this.listener = listener;
    }

    public void join(Context context, String appId, String token, String channelName, int uid) throws Exception {
        if (engine == null) {
            engine = RtcEngine.create(context.getApplicationContext(), appId, eventHandler);
            engine.setChannelProfile(Constants.CHANNEL_PROFILE_COMMUNICATION);
            engine.enableAudio();
        }

        ChannelMediaOptions options = new ChannelMediaOptions();
        options.channelProfile = Constants.CHANNEL_PROFILE_COMMUNICATION;
        options.clientRoleType = Constants.CLIENT_ROLE_BROADCASTER;
        options.publishMicrophoneTrack = true;
        options.autoSubscribeAudio = true;

        engine.joinChannel(token, channelName, uid, options);
    }

    public void muteLocalAudio(boolean muted) {
        if (engine != null) {
            engine.muteLocalAudioStream(muted);
        }
    }

    public void enableSpeaker(boolean enabled) {
        if (engine != null) {
            engine.setEnableSpeakerphone(enabled);
        }
    }

    public void leave() {
        if (engine != null) {
            engine.leaveChannel();
        }
    }

    public void destroy() {
        if (engine != null) {
            engine.leaveChannel();
            RtcEngine.destroy();
            engine = null;
        }
    }

    private final IRtcEngineEventHandler eventHandler = new IRtcEngineEventHandler() {
        @Override
        public void onJoinChannelSuccess(String channel, int uid, int elapsed) {
            if (listener != null) {
                listener.onJoinSuccess(channel, uid);
            }
        }

        @Override
        public void onUserJoined(int uid, int elapsed) {
            if (listener != null) {
                listener.onUserJoined(uid);
            }
        }

        @Override
        public void onUserOffline(int uid, int reason) {
            if (listener != null) {
                listener.onUserOffline(uid);
            }
        }

        @Override
        public void onError(int err) {
            if (listener != null) {
                listener.onError("Agora 错误: " + err);
            }
        }
    };
}
