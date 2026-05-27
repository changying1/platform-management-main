package com.app.myapplication.data.model.call;

import com.google.gson.annotations.SerializedName;

import java.util.ArrayList;
import java.util.List;

public class AppVoiceRecord {
    @SerializedName("room_id")
    public String roomId;

    public String title;

    @SerializedName("initiator_id")
    public String initiatorId;

    public String status;

    @SerializedName("member_count")
    public int memberCount;

    @SerializedName("duration_seconds")
    public int durationSeconds;

    @SerializedName("started_at")
    public String startedAt;

    @SerializedName("ended_at")
    public String endedAt;

    public List<AppVoiceMember> members = new ArrayList<>();
}
