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

    @SerializedName("platform_type")
    private String platformType;

    @SerializedName("device_type")
    private String deviceType;

    @SerializedName("access_source")
    private String accessSource;

    @SerializedName("ptz_source")
    private String ptzSource;

    @SerializedName("device_serial")
    private String deviceSerial;

    @SerializedName("sim_card_id")
    private String simCardId;

    @SerializedName("channel_no")
    private Integer channelNo;

    @SerializedName("stream_protocol")
    private String streamProtocol;

    @SerializedName("company")
    private String company;

    @SerializedName("project")
    private String project;

    @SerializedName("install_location")
    private String installLocation;

    @SerializedName("grid")
    private String grid;

    @SerializedName("team")
    private String team;

    @SerializedName("manager")
    private String manager;

    @SerializedName("manager_phone")
    private String managerPhone;

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

    private transient boolean frontendOnly;

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

    public void setPassword(String password) {
        this.password = password;
    }

    public String getPlatformType() {
        return platformType;
    }

    public void setPlatformType(String platformType) {
        this.platformType = platformType;
    }

    public String getDeviceType() {
        return deviceType;
    }

    public void setDeviceType(String deviceType) {
        this.deviceType = deviceType;
    }

    public String getAccessSource() {
        return accessSource;
    }

    public void setAccessSource(String accessSource) {
        this.accessSource = accessSource;
    }

    public String getPtzSource() {
        return ptzSource;
    }

    public void setPtzSource(String ptzSource) {
        this.ptzSource = ptzSource;
    }

    public String getDeviceSerial() {
        return deviceSerial;
    }

    public void setDeviceSerial(String deviceSerial) {
        this.deviceSerial = deviceSerial;
    }

    public String getSimCardId() {
        return simCardId;
    }

    public void setSimCardId(String simCardId) {
        this.simCardId = simCardId;
    }

    public Integer getChannelNo() {
        return channelNo;
    }

    public void setChannelNo(Integer channelNo) {
        this.channelNo = channelNo;
    }

    public String getStreamProtocol() {
        return streamProtocol;
    }

    public void setStreamProtocol(String streamProtocol) {
        this.streamProtocol = streamProtocol;
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

    public String getInstallLocation() {
        return installLocation;
    }

    public void setInstallLocation(String installLocation) {
        this.installLocation = installLocation;
    }

    public String getGrid() {
        return grid;
    }

    public void setGrid(String grid) {
        this.grid = grid;
    }

    public String getTeam() {
        return team;
    }

    public void setTeam(String team) {
        this.team = team;
    }

    public String getManager() {
        return manager;
    }

    public void setManager(String manager) {
        this.manager = manager;
    }

    public String getManagerPhone() {
        return managerPhone;
    }

    public void setManagerPhone(String managerPhone) {
        this.managerPhone = managerPhone;
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

    /** online / offline / fault / maintenance */
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

    public boolean isFrontendOnly() {
        return frontendOnly;
    }

    public void setFrontendOnly(boolean frontendOnly) {
        this.frontendOnly = frontendOnly;
    }
}
