package com.app.myapplication.data.model;

public class Alarm {

    private int id;               // 修改为 int 类型
    private String device_id;     // 设备 ID（与后端一致）
    private Integer fence_id;     // 可选的围栏 ID
    private String alarm_type;    // 报警类型（与后端一致）
    private String severity;      // 严重性（级别）
    private String description;   // 描述
    private String location;      // 位置
    private String status;        // 状态
    private String timestamp;     // 时间戳
    private String handledAt;     // 处理时间（可选）

    // 无参构造函数
    public Alarm() {
    }

    // 构造函数
    public Alarm(int id, String device_id, Integer fence_id, String alarm_type, String severity,
                 String description, String location, String status, String timestamp, String handledAt) {
        this.id = id;
        this.device_id = device_id;
        this.fence_id = fence_id;
        this.alarm_type = alarm_type;
        this.severity = severity;
        this.description = description;
        this.location = location;
        this.status = status;
        this.timestamp = timestamp;
        this.handledAt = handledAt;
    }

    // Getter 和 Setter 方法
    public int getId() { return id; }
    public void setId(int id) { this.id = id; }

    public String getDeviceId() { return device_id; }
    public void setDeviceId(String deviceId) { this.device_id = deviceId; }

    public Integer getFenceId() { return fence_id; }
    public void setFenceId(Integer fenceId) { this.fence_id = fenceId; }

    public String getAlarmType() { return alarm_type; }
    public void setAlarmType(String alarmType) { this.alarm_type = alarmType; }

    public String getSeverity() { return severity; }
    public void setSeverity(String severity) { this.severity = severity; }

    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }

    public String getLocation() { return location; }
    public void setLocation(String location) { this.location = location; }

    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }

    public String getTimestamp() { return timestamp; }
    public void setTimestamp(String timestamp) { this.timestamp = timestamp; }

    public String getHandledAt() { return handledAt; }
    public void setHandledAt(String handledAt) { this.handledAt = handledAt; }
}
