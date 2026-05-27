package com.app.myapplication.data.model.call;

import com.google.gson.annotations.SerializedName;

public class AppVoiceParticipant {
    @SerializedName("user_id")
    public String userId;

    public String name;

    @SerializedName("client_type")
    public String clientType = "app";

    public AppVoiceParticipant() {
    }

    public AppVoiceParticipant(String userId, String name) {
        this.userId = userId;
        this.name = name;
        this.clientType = "app";
    }
}
