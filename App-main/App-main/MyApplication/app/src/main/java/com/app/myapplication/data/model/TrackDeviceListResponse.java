package com.app.myapplication.data.model;

import com.google.gson.annotations.SerializedName;
import java.util.List;

public class TrackDeviceListResponse {
    @SerializedName("devices")
    private List<TrackDevice> devices;

    public List<TrackDevice> getDevices() {
        return devices;
    }

    public void setDevices(List<TrackDevice> devices) {
        this.devices = devices;
    }
}
