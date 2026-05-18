package com.app.myapplication.data.model;

public class TrackPoint {
    public double lat;
    public double lng;
    public long ts; // 时间戳（毫秒）

    public TrackPoint(double lat, double lng, long ts) {
        this.lat = lat;
        this.lng = lng;
        this.ts = ts;
    }
}