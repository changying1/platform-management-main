package com.app.myapplication.data.model;

import com.google.gson.annotations.SerializedName;

public class Alarm {

    @SerializedName("id")
    private long id;

    @SerializedName("device_id")
    private String deviceId;

    @SerializedName("fence_id")
    private Long fenceId;

    @SerializedName("project_id")
    private Long projectId;

    @SerializedName("alarm_type")
    private String alarmType;

    @SerializedName("severity")
    private String severity;

    @SerializedName("description")
    private String description;

    @SerializedName("location")
    private String location;

    @SerializedName("status")
    private String status;

    @SerializedName("timestamp")
    private String timestamp;

    @SerializedName("handled_at")
    private String handledAt;

    @SerializedName("alarm_image_path")
    private String alarmImagePath;

    @SerializedName("recording_path")
    private String recordingPath;

    @SerializedName("recording_status")
    private String recordingStatus;

    @SerializedName("recording_error")
    private String recordingError;

    @SerializedName("alarm_source")
    private String alarmSource;

    @SerializedName("source_type")
    private String sourceType;

    @SerializedName("personnel_id")
    private String personnelId;

    @SerializedName("device_name")
    private String deviceName;

    @SerializedName("person_name")
    private String personName;

    @SerializedName("image_url")
    private String imageUrlField;

    @SerializedName("snapshot_url")
    private String snapshotUrl;

    @SerializedName("image_path")
    private String imagePath;

    @SerializedName("snapshot_path")
    private String snapshotPath;

    private String imageUrl;

    @SerializedName("video_url")
    private String videoUrl;

    @SerializedName("duration_seconds")
    private int durationSeconds;

    public Alarm() {
    }

    public long getId() {
        return id;
    }

    public void setId(long id) {
        this.id = id;
    }

    public String getDeviceId() {
        return deviceId;
    }

    public void setDeviceId(String deviceId) {
        this.deviceId = deviceId;
    }

    public Long getFenceId() {
        return fenceId;
    }

    public void setFenceId(Long fenceId) {
        this.fenceId = fenceId;
    }

    public Long getProjectId() {
        return projectId;
    }

    public void setProjectId(Long projectId) {
        this.projectId = projectId;
    }

    public String getAlarmType() {
        return alarmType;
    }

    public void setAlarmType(String alarmType) {
        this.alarmType = alarmType;
    }

    public String getSeverity() {
        return severity;
    }

    public void setSeverity(String severity) {
        this.severity = severity;
    }

    public String getDescription() {
        return description;
    }

    public void setDescription(String description) {
        this.description = description;
    }

    public String getLocation() {
        return location;
    }

    public void setLocation(String location) {
        this.location = location;
    }

    public String getStatus() {
        return status;
    }

    public void setStatus(String status) {
        this.status = status;
    }

    public String getTimestamp() {
        return timestamp;
    }

    public void setTimestamp(String timestamp) {
        this.timestamp = timestamp;
    }

    public String getHandledAt() {
        return handledAt;
    }

    public void setHandledAt(String handledAt) {
        this.handledAt = handledAt;
    }

    public String getAlarmImagePath() {
        return alarmImagePath;
    }

    public void setAlarmImagePath(String alarmImagePath) {
        this.alarmImagePath = alarmImagePath;
    }

    public String getRecordingPath() {
        return recordingPath;
    }

    public void setRecordingPath(String recordingPath) {
        this.recordingPath = recordingPath;
    }

    public String getRecordingStatus() {
        return recordingStatus;
    }

    public void setRecordingStatus(String recordingStatus) {
        this.recordingStatus = recordingStatus;
    }

    public String getRecordingError() {
        return recordingError;
    }

    public void setRecordingError(String recordingError) {
        this.recordingError = recordingError;
    }

    public String getAlarmSource() {
        return alarmSource;
    }

    public void setAlarmSource(String alarmSource) {
        this.alarmSource = alarmSource;
    }

    public String getSourceType() {
        return sourceType;
    }

    public void setSourceType(String sourceType) {
        this.sourceType = sourceType;
    }

    public String getPersonnelId() {
        return personnelId;
    }

    public void setPersonnelId(String personnelId) {
        this.personnelId = personnelId;
    }

    public String getDeviceName() {
        return deviceName;
    }

    public void setDeviceName(String deviceName) {
        this.deviceName = deviceName;
    }

    public String getPersonName() {
        return personName;
    }

    public void setPersonName(String personName) {
        this.personName = personName;
    }

    public String getImageUrlField() {
        return imageUrlField;
    }

    public void setImageUrlField(String imageUrlField) {
        this.imageUrlField = imageUrlField;
    }

    public String getSnapshotUrl() {
        return snapshotUrl;
    }

    public void setSnapshotUrl(String snapshotUrl) {
        this.snapshotUrl = snapshotUrl;
    }

    public String getImagePath() {
        return imagePath;
    }

    public void setImagePath(String imagePath) {
        this.imagePath = imagePath;
    }

    public String getSnapshotPath() {
        return snapshotPath;
    }

    public void setSnapshotPath(String snapshotPath) {
        this.snapshotPath = snapshotPath;
    }

    public String getImageUrl() {
        return imageUrl;
    }

    public void setImageUrl(String imageUrl) {
        this.imageUrl = imageUrl;
    }

    public String getVideoUrl() {
        return videoUrl;
    }

    public void setVideoUrl(String videoUrl) {
        this.videoUrl = videoUrl;
    }

    public int getDurationSeconds() {
        return durationSeconds;
    }

    public void setDurationSeconds(int durationSeconds) {
        this.durationSeconds = durationSeconds;
    }

    public String getDisplayAlarmType() {
        if (alarmType == null) return "未知告警";

        switch (alarmType.trim().toLowerCase()) {
            case "fence_intrusion":
            case "电子围栏闯入":
                return "电子围栏入侵";
            case "fence_exit":
            case "电子围栏越界":
                return "电子围栏越界";
            case "intrusion":
                return "区域入侵";
            case "helmet_missing":
                return "未佩戴安全帽";
            case "person_fall":
                return "人员倒地";
            case "video_device_offline":
                return "视频设备离线";
            case "video_device_sleeping":
                return "视频设备休眠";
            case "video_device_privacy_enabled":
                return "视频设备隐私模式开启";
            case "video_device_storage_abnormal":
                return "视频设备存储异常";
            case "video_device_low_battery":
                return "视频设备低电量";
            case "video_device_weak_signal":
                return "视频设备信号弱";
            case "video_traffic_low":
                return "视频设备流量不足";
            default:
                if (alarmType.toUpperCase().startsWith("VIDEO_DEVICE_")) {
                    return "视频设备告警";
                }
                return alarmType;
        }
    }

    public String getDisplaySeverity() {
        if (severity == null) return "medium";
        return severity.toLowerCase();
    }

    public String getDisplayStatus() {
        if (status == null) return "pending";
        return status.toLowerCase();
    }
}
