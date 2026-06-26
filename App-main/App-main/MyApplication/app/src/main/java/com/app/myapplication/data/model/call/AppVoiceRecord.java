package com.app.myapplication.data.model.call;

import com.google.gson.annotations.SerializedName;

import java.util.ArrayList;
import java.util.List;

public class AppVoiceRecord {
    @SerializedName("id")
    public Integer id;

    @SerializedName("type")
    public String type;

    @SerializedName("source")
    public String source;

    @SerializedName("from")
    public String from;

    @SerializedName("from_role")
    public String fromRole;

    @SerializedName("to_names")
    public List<String> toNames = new ArrayList<>();

    @SerializedName("target_phones")
    public List<String> targetPhones = new ArrayList<>();

    @SerializedName("transcript")
    public String transcript;

    @SerializedName("audio_url")
    public String audioUrl;

    @SerializedName("audio_mime_type")
    public String audioMimeType;

    @SerializedName("duration")
    public int duration;

    @SerializedName("batch_id")
    public String batchId;

    @SerializedName("created_at")
    public String createdAt;

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
