package com.app.myapplication.data.model;

import java.util.List;

public class TrackRecord {
    private String id;
    private String deviceId;
    private String deviceName;
    private String holder;
    private String company;
    private String project;
    private String team;
    private String startTime;
    private String endTime;
    private List<TrackPoint> points;

    public TrackRecord() {
    }

    public TrackRecord(String id, String deviceId, String deviceName, String holder,
                       String company, String project, String team,
                       String startTime, String endTime, List<TrackPoint> points) {
        this.id = id;
        this.deviceId = deviceId;
        this.deviceName = deviceName;
        this.holder = holder;
        this.company = company;
        this.project = project;
        this.team = team;
        this.startTime = startTime;
        this.endTime = endTime;
        this.points = points;
    }

    public String getId() {
        return id;
    }

    public void setId(String id) {
        this.id = id;
    }

    public String getDeviceId() {
        return deviceId;
    }

    public void setDeviceId(String deviceId) {
        this.deviceId = deviceId;
    }

    public String getDeviceName() {
        return deviceName;
    }

    public void setDeviceName(String deviceName) {
        this.deviceName = deviceName;
    }

    public String getHolder() {
        return holder;
    }

    public void setHolder(String holder) {
        this.holder = holder;
    }

    public String getCompany() {
        return company;
    }

    public void setCompany(String company) {
        this.company = company;
    }

    public String getProject() {
        return project;
    }

    public void setProject(String project) {
        this.project = project;
    }

    public String getTeam() {
        return team;
    }

    public void setTeam(String team) {
        this.team = team;
    }

    public String getStartTime() {
        return startTime;
    }

    public void setStartTime(String startTime) {
        this.startTime = startTime;
    }

    public String getEndTime() {
        return endTime;
    }

    public void setEndTime(String endTime) {
        this.endTime = endTime;
    }

    public List<TrackPoint> getPoints() {
        return points;
    }

    public void setPoints(List<TrackPoint> points) {
        this.points = points;
    }

    public int getPointCount() {
        return points != null ? points.size() : 0;
    }

    public double getDurationMinutes() {
        if (points == null || points.size() < 2) {
            return 0;
        }
        return points.size() * 5.0 / 60.0;
    }
}
