package com.app.myapplication.data.model.manage;

import com.google.gson.annotations.SerializedName;

public class LocationDevice {

    @SerializedName("device_id")
    private String deviceId;

    @SerializedName("name")
    private String name;

    @SerializedName("lat")
    private double lat;

    @SerializedName("lng")
    private double lng;

    @SerializedName("type")
    private String type;

    @SerializedName("company")
    private String company;

    @SerializedName("project")
    private String project;

    @SerializedName("grid")
    private String grid;

    @SerializedName("team")
    private String team;

    @SerializedName("holder")
    private String holder;

    @SerializedName("holderPhone")
    private String holderPhone;

    @SerializedName("status")
    private String status;

    @SerializedName("remark")
    private String remark;

    @SerializedName("lastUpdate")
    private String lastUpdate;

    public LocationDevice() {}

    public String getDeviceId() { return deviceId; }
    public void setDeviceId(String deviceId) { this.deviceId = deviceId; }

    public String getName() { return name; }
    public void setName(String name) { this.name = name; }

    public double getLat() { return lat; }
    public void setLat(double lat) { this.lat = lat; }

    public double getLng() { return lng; }
    public void setLng(double lng) { this.lng = lng; }

    public String getType() { return type; }
    public void setType(String type) { this.type = type; }

    public String getCompany() { return company; }
    public void setCompany(String company) { this.company = company; }

    public String getProject() { return project; }
    public void setProject(String project) { this.project = project; }

    public String getGrid() { return grid; }
    public void setGrid(String grid) { this.grid = grid; }

    public String getTeam() { return team; }
    public void setTeam(String team) { this.team = team; }

    public String getHolder() { return holder; }
    public void setHolder(String holder) { this.holder = holder; }

    public String getHolderPhone() { return holderPhone; }
    public void setHolderPhone(String holderPhone) { this.holderPhone = holderPhone; }

    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }

    public String getRemark() { return remark; }
    public void setRemark(String remark) { this.remark = remark; }

    public String getLastUpdate() { return lastUpdate; }
    public void setLastUpdate(String lastUpdate) { this.lastUpdate = lastUpdate; }
}
