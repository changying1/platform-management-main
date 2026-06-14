package com.app.myapplication.data.model;

/**
 * 定位设备
 */
public class LocationDevice {
    
    private String deviceId;
    private String name;
    private String type; // JT808
    private String status; // 在线、离线
    private String bindPerson;
    private String imei;
    private String simCard;
    
    public LocationDevice(String deviceId, String name, String type, String status, String bindPerson) {
        this.deviceId = deviceId;
        this.name = name;
        this.type = type;
        this.status = status;
        this.bindPerson = bindPerson;
    }
    
    // Getters and Setters
    public String getDeviceId() { return deviceId; }
    public void setDeviceId(String deviceId) { this.deviceId = deviceId; }
    
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    
    public String getType() { return type; }
    public void setType(String type) { this.type = type; }
    
    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }
    
    public String getBindPerson() { return bindPerson; }
    public void setBindPerson(String bindPerson) { this.bindPerson = bindPerson; }
    
    public String getImei() { return imei; }
    public void setImei(String imei) { this.imei = imei; }
    
    public String getSimCard() { return simCard; }
    public void setSimCard(String simCard) { this.simCard = simCard; }
    
    public int getStatusColor() {
        return "在线".equals(status) ? 0xFF10b981 : 0xFFef4444;
    }
}
