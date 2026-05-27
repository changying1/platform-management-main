package com.app.myapplication.data.model;

import com.google.gson.annotations.SerializedName;

public class LiveStreamInfo {
    @SerializedName(value = "url", alternate = {
            "stream_url",
            "streamUrl",
            "play_url",
            "playUrl"
    })
    private String streamUrl;

    @SerializedName(value = "play_type", alternate = {
            "playType",
            "protocol"
    })
    private String playType;

    @SerializedName("platform")
    private String platform;

    @SerializedName("device_serial")
    private String deviceSerial;

    @SerializedName("channel_no")
    private Integer channelNo;

    @SerializedName("access_token")
    private String accessToken;

    public String getStreamUrl() {
        return streamUrl;
    }

    public String getUrl() {
        return streamUrl;
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
        String value = streamUrl == null ? "" : streamUrl.trim().toLowerCase();
        return "ezopen".equals(type) || value.startsWith("ezopen://");
    }

    @Override
    public String toString() {
        return "LiveStreamInfo{"
                + "streamUrl='" + streamUrl + '\''
                + ", playType='" + playType + '\''
                + ", platform='" + platform + '\''
                + ", deviceSerial='" + deviceSerial + '\''
                + ", channelNo=" + channelNo
                + ", hasAccessToken=" + (accessToken != null && !accessToken.trim().isEmpty())
                + '}';
    }
}
