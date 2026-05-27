package com.app.myapplication.data.model.call;

import com.google.gson.annotations.SerializedName;

public class AppVoiceMuteRequest {
    @SerializedName("user_id")
    public String userId;

    public boolean muted;

    public AppVoiceMuteRequest(String userId, boolean muted) {
        this.userId = userId;
        this.muted = muted;
    }
}
