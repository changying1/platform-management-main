package com.app.myapplication.data.model.call;

import com.google.gson.annotations.SerializedName;

import java.util.ArrayList;
import java.util.List;

public class AppVoiceRoom {
    @SerializedName("room_id")
    public String roomId;

    @SerializedName("agora_channel")
    public String agoraChannel;

    public String title;
    public String type;
    public String status;

    @SerializedName("initiator_id")
    public String initiatorId;

    public List<AppVoiceMember> members = new ArrayList<>();

    @SerializedName("created_at")
    public String createdAt;

    @SerializedName("started_at")
    public String startedAt;

    @SerializedName("ended_at")
    public String endedAt;
}
