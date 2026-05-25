package com.app.myapplication.data.model.call;

import com.google.gson.annotations.SerializedName;

public class AgoraJoinInfo {
    @SerializedName("app_id")
    public String appId;

    @SerializedName("room_id")
    public String roomId;

    @SerializedName("channel_name")
    public String channelName;

    public int uid;
    public String token;

    @SerializedName("expire_at")
    public String expireAt;

    public AppVoiceRoom room;
}
