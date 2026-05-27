package com.app.myapplication.data.model;

import com.google.gson.annotations.SerializedName;
import java.util.List;

public class TrackDevice {
    @SerializedName("_id")
    private IdWrapper id;
    
    @SerializedName("device_id")
    private String deviceId;
    
    @SerializedName("name")
    private String name;
    
    @SerializedName("holder")
    private String holder;
    
    @SerializedName("person_name")
    private String personName;
    
    @SerializedName("lat")
    private Double lat;
    
    @SerializedName("lng")
    private Double lng;
    
    @SerializedName("company")
    private String company;
    
    @SerializedName("project")
    private String project;
    
    @SerializedName("team")
    private String team;
    
    @SerializedName("status")
    private String status;
    
    @SerializedName("holderPhone")
    private String holderPhone;
    
    @SerializedName("lastUpdate")
    private String lastUpdate;
    
    @SerializedName("createdAt")
    private String createdAt;
    
    @SerializedName("updatedAt")
    private String updatedAt;
    
    @SerializedName("trajectory")
    private List<TrajectoryPoint> trajectory;
    
    @SerializedName("remark")
    private String remark;
    
    @SerializedName("type")
    private String type;

    public static class IdWrapper {
        @SerializedName("$oid")
        private String oid;

        public String getOid() {
            return oid;
        }

        public void setOid(String oid) {
            this.oid = oid;
        }
    }

    public String getDeviceId() {
        return deviceId;
    }

    public void setDeviceId(String deviceId) {
        this.deviceId = deviceId;
    }

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public String getHolder() {
        return holder;
    }

    public void setHolder(String holder) {
        this.holder = holder;
    }

    public String getPersonName() {
        return personName;
    }

    public void setPersonName(String personName) {
        this.personName = personName;
    }

    public String getDisplayHolder() {
        if (holder != null && !holder.isEmpty()) {
            return holder;
        }
        if (personName != null && !personName.isEmpty()) {
            return personName;
        }
        return "未知人员";
    }

    public Double getLat() {
        return lat;
    }

    public void setLat(Double lat) {
        this.lat = lat;
    }

    public Double getLng() {
        return lng;
    }

    public void setLng(Double lng) {
        this.lng = lng;
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

    public String getStatus() {
        return status;
    }

    public void setStatus(String status) {
        this.status = status;
    }

    public String getHolderPhone() {
        return holderPhone;
    }

    public void setHolderPhone(String holderPhone) {
        this.holderPhone = holderPhone;
    }

    public String getLastUpdate() {
        return lastUpdate;
    }

    public void setLastUpdate(String lastUpdate) {
        this.lastUpdate = lastUpdate;
    }

    public String getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(String createdAt) {
        this.createdAt = createdAt;
    }

    public String getUpdatedAt() {
        return updatedAt;
    }

    public void setUpdatedAt(String updatedAt) {
        this.updatedAt = updatedAt;
    }

    public List<TrajectoryPoint> getTrajectory() {
        return trajectory;
    }

    public void setTrajectory(List<TrajectoryPoint> trajectory) {
        this.trajectory = trajectory;
    }

    public String getRemark() {
        return remark;
    }

    public void setRemark(String remark) {
        this.remark = remark;
    }

    public String getType() {
        return type;
    }

    public void setType(String type) {
        this.type = type;
    }

    public IdWrapper getId() {
        return id;
    }

    public void setId(IdWrapper id) {
        this.id = id;
    }
}
