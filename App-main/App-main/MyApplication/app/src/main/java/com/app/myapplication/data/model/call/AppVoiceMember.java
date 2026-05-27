package com.app.myapplication.data.model.call;

import com.google.gson.annotations.SerializedName;

public class AppVoiceMember {
    @SerializedName("user_id")
    public String userId;

    public String name;

    @SerializedName("client_type")
    public String clientType;

    public String role;
    public String status;

    @SerializedName("agora_uid")
    public Integer agoraUid;

    public boolean muted;

    @SerializedName("joined_at")
    public String joinedAt;

    @SerializedName("left_at")
    public String leftAt;
}
