package com.app.myapplication.data.model;

/**
 * 摄像头设备
 */
public class CameraDevice {
    
    private String deviceId;
    private String name;
    private String type; // 萤石云、海康等
    private String status; // 在线、离线
    private String project;
    private String serialNumber;
    private String verificationCode;
    
    public CameraDevice(String deviceId, String name, String type, String status, String project) {
        this.deviceId = deviceId;
        this.name = name;
        this.type = type;
        this.status = status;
        this.project = project;
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
    
    public String getProject() { return project; }
    public void setProject(String project) { this.project = project; }
    
    public String getSerialNumber() { return serialNumber; }
    public void setSerialNumber(String serialNumber) { this.serialNumber = serialNumber; }
    
    public String getVerificationCode() { return verificationCode; }
    public void setVerificationCode(String verificationCode) { this.verificationCode = verificationCode; }
    
    public int getStatusColor() {
        return "在线".equals(status) ? 0xFF10b981 : 0xFFef4444;
    }
}
