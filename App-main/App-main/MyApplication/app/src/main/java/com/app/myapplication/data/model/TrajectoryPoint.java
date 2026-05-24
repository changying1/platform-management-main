package com.app.myapplication.data.model;

import com.google.gson.annotations.SerializedName;

public class TrajectoryPoint {
    @SerializedName("lat")
    private double lat;
    
    @SerializedName("lng")
    private double lng;
    
    @SerializedName("timestamp")
    private String timestamp;
    
    @SerializedName("speed")
    private Double speed;
    
    @SerializedName("direction")
    private Double direction;

    public TrajectoryPoint() {
    }

    public TrajectoryPoint(double lat, double lng, String timestamp, Double speed, Double direction) {
        this.lat = lat;
        this.lng = lng;
        this.timestamp = timestamp;
        this.speed = speed;
        this.direction = direction;
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

    public String getTimestamp() {
        return timestamp;
    }

    public void setTimestamp(String timestamp) {
        this.timestamp = timestamp;
    }

    public Double getSpeed() {
        return speed;
    }

    public void setSpeed(Double speed) {
        this.speed = speed;
    }

    public Double getDirection() {
        return direction;
    }

    public void setDirection(Double direction) {
        this.direction = direction;
    }
}
