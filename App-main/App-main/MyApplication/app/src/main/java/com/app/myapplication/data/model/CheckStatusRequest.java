package com.app.myapplication.data.model;

public class CheckStatusRequest {
    public String device_id;
    public double lat;
    public double lng;

    public CheckStatusRequest(String deviceId, double lat, double lng) {
        this.device_id = deviceId;
        this.lat = lat;
        this.lng = lng;
    }
}
