package com.app.myapplication.data.model.call;

import com.google.gson.annotations.SerializedName;

public class AppVoiceRoomActionRequest {
    @SerializedName("user_id")
    public String userId;

    @SerializedName("client_type")
    public String clientType = "app";

    public AppVoiceRoomActionRequest(String userId) {
        this.userId = userId;
    }
}
