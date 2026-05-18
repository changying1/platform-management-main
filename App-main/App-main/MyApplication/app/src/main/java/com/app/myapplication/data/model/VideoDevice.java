package com.app.myapplication.data.model;

import com.google.gson.annotations.SerializedName;

public class VideoDevice {

    @SerializedName("id")
    private Integer id;

    @SerializedName("name")
    private String name;

    // 网络信息
    @SerializedName("ip_address")
    private String ipAddress;

    @SerializedName("port")
    private Integer port;

    @SerializedName("username")
    private String username;

    @SerializedName("password")
    public String password;

    // 流地址（RTSP / HLS / FLV）
    @SerializedName("rtsp_url")
    private String streamUrl;

    // 位置信息
    @SerializedName("latitude")
    private Double latitude;

    @SerializedName("longitude")
    private Double longitude;

    // 状态：online / offline
    @SerializedName("status")
    private String status;

    @SerializedName("remark")
    private String remark;

    // 启用状态：1 启用，0 禁用
    @SerializedName("is_active")
    private Integer isActive;

    /* ===================== getters & setters ===================== */

    public Integer getId() {
        return id;
    }

    public void setId(Integer id) {
        this.id = id;
    }

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public String getIpAddress() {
        return ipAddress;
    }

    public void setIpAddress(String ipAddress) {
        this.ipAddress = ipAddress;
    }

    public Integer getPort() {
        return port;
    }

    public void setPort(Integer port) {
        this.port = port;
    }

    public String getUsername() {
        return username;
    }

    public void setUsername(String username) {
        this.username = username;
    }

    public String getPassword() {
        return password;
    }



    public String getStreamUrl() {
        return streamUrl;
    }

    public void setStreamUrl(String streamUrl) {
        this.streamUrl = streamUrl;
    }

    public Double getLatitude() {
        return latitude;
    }

    public void setLatitude(Double latitude) {
        this.latitude = latitude;
    }

    public Double getLongitude() {
        return longitude;
    }

    public void setLongitude(Double longitude) {
        this.longitude = longitude;
    }

    public String getStatus() {
        return status;
    }

    /** online / offline */
    public void setStatus(String status) {
        this.status = status;
    }

    public String getRemark() {
        return remark;
    }

    public void setRemark(String remark) {
        this.remark = remark;
    }

    public boolean getIsActive() {
        return this.isActive == 1;
    }

    /** 1 = 启用，0 = 禁用 */
    public void setIsActive(Integer isActive) {
        this.isActive = isActive;
    }
}
