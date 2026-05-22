package com.app.myapplication.data.model;

import com.google.gson.annotations.SerializedName;

public class LiveStreamInfo {
    @SerializedName("url")
    private String url;

    @SerializedName("play_type")
    private String playType;

    @SerializedName("platform")
    private String platform;

    @SerializedName("device_serial")
    private String deviceSerial;

    @SerializedName("channel_no")
    private Integer channelNo;

    @SerializedName("access_token")
    private String accessToken;

    public String getUrl() {
        return url;
    }

    public String getPlayType() {
        return playType;
    }

    public String getPlatform() {
        return platform;
    }

    public String getDeviceSerial() {
        return deviceSerial;
    }

    public Integer getChannelNo() {
        return channelNo;
    }

    public String getAccessToken() {
        return accessToken;
    }

    public boolean isEzopen() {
        String type = playType == null ? "" : playType.trim().toLowerCase();
        String value = url == null ? "" : url.trim().toLowerCase();
        return "ezopen".equals(type) || value.startsWith("ezopen://");
    }
}
