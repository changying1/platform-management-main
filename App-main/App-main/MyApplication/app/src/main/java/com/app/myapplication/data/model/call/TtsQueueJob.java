package com.app.myapplication.data.model.call;

import com.google.gson.annotations.SerializedName;

public class TtsQueueJob {
    @SerializedName("id")
    public String id;

    @SerializedName("device_phone")
    public String devicePhone;

    @SerializedName("device_name")
    public String deviceName;

    @SerializedName("status")
    public String status;
}
