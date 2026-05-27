package com.app.myapplication.data.model;

import com.google.gson.JsonObject;
import com.google.gson.annotations.SerializedName;

/**
 * 设备数据模型，对应后端 DeviceItem
 */
public class DeviceItem {

    @SerializedName("device_id")
    public String deviceId;

    @SerializedName("name")
    public String name;

    @SerializedName("lat")
    public Double lat;

    @SerializedName("lng")
    public Double lng;

    @SerializedName("company")
    public String company;

    @SerializedName("project")
    public String project;

    @SerializedName("type")
    public String type;

    @SerializedName("team")
    public String team;

    @SerializedName("status")
    public String status;

    @SerializedName("holder")
    public String holder;

    @SerializedName("holderPhone")
    public String holderPhone;

    @SerializedName("remark")
    public String remark;

    @SerializedName("lastUpdate")
    public String lastUpdate;

    @SerializedName("createdAt")
    public String createdAt;

    @SerializedName("updatedAt")
    public String updatedAt;

    public DeviceItem() {
    }

    public boolean isOnline() {
        return "online".equalsIgnoreCase(status);
    }

    public boolean hasLocation() {
        return lat != null && lng != null;
    }

    /**
     * 从 JsonObject 解析设备数据
     */
    public static DeviceItem fromJson(JsonObject o) {
        DeviceItem d = new DeviceItem();
        if (o == null) return d;

        d.deviceId = optString(o, "device_id");
        d.name = optString(o, "name");
        d.lat = optDouble(o, "lat");
        d.lng = optDouble(o, "lng");
        d.company = optString(o, "company");
        d.project = optString(o, "project");
        d.type = optString(o, "type");
        d.team = optString(o, "team");
        d.status = optString(o, "status");
        d.holder = optString(o, "holder");
        d.holderPhone = optString(o, "holderPhone");
        d.remark = optString(o, "remark");
        d.lastUpdate = optString(o, "lastUpdate");
        d.createdAt = optString(o, "createdAt");
        d.updatedAt = optString(o, "updatedAt");

        return d;
    }

    private static String optString(JsonObject o, String key) {
        if (o == null || !o.has(key) || o.get(key).isJsonNull()) return null;
        try {
            return o.get(key).getAsString();
        } catch (Exception e) {
            return null;
        }
    }

    private static Double optDouble(JsonObject o, String key) {
        if (o == null || !o.has(key) || o.get(key).isJsonNull()) return null;
        try {
            return o.get(key).getAsDouble();
        } catch (Exception e) {
            return null;
        }
    }
}
