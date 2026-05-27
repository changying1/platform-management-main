package com.app.myapplication.data.model;

public class TrackPoint {
    private double lat;
    private double lng;
    private String time;
    private Double speed;

    public TrackPoint() {
    }

    public TrackPoint(double lat, double lng, String time, Double speed) {
        this.lat = lat;
        this.lng = lng;
        this.time = time;
        this.speed = speed;
    }

    public double getLat() {
        return lat;
    }

    public void setLat(double lat) {
        this.lat = lat;
    }

    public double getLng() {
        return lng;
    }

    public void setLng(double lng) {
        this.lng = lng;
    }

    public String getTime() {
        return time;
    }

    public void setTime(String time) {
        this.time = time;
    }

    public Double getSpeed() {
        return speed;
    }

    public void setSpeed(Double speed) {
        this.speed = speed;
    }
}
