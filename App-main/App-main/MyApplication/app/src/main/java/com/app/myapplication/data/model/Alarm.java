package com.app.myapplication.data.model;

import com.google.gson.JsonElement;
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

    @SerializedName(value = "boxed_video_url", alternate = {"boxedVideoUrl"})
    private String boxedVideoUrl;

    @SerializedName(value = "annotated_video_url", alternate = {"annotatedVideoUrl"})
    private String annotatedVideoUrl;

    @SerializedName(value = "alarm_video_url", alternate = {"alarmVideoUrl"})
    private String alarmVideoUrl;

    @SerializedName(value = "alarm_video_path", alternate = {"alarmVideoPath"})
    private String alarmVideoPath;

    @SerializedName(value = "raw_video_path", alternate = {"rawVideoPath"})
    private String rawVideoPath;

    @SerializedName(value = "video_url", alternate = {"videoUrl"})
    private String videoUrl;

    @SerializedName(value = "clip_url", alternate = {"clipUrl"})
    private String clipUrl;

    @SerializedName(value = "duration_seconds", alternate = {"durationSeconds"})
    private double durationSeconds;

    @SerializedName(value = "video_duration", alternate = {"videoDuration", "duration", "clip_duration", "clipDuration"})
    private Double videoDuration;

    @SerializedName(value = "start_time", alternate = {"startTime"})
    private String startTime;

    @SerializedName(value = "recording_start_time", alternate = {"recordingStartTime"})
    private String recordingStartTime;

    @SerializedName(value = "actual_clip_start", alternate = {"actualClipStart", "clip_start", "video_start_time", "videoStartTime"})
    private String actualClipStart;

    @SerializedName(value = "actual_clip_end", alternate = {"actualClipEnd", "clip_end", "video_end_time", "videoEndTime"})
    private String actualClipEnd;

    @SerializedName(value = "snapshot_time", alternate = {"snapshotTime", "image_time", "imageTime", "capture_time", "captureTime"})
    private String snapshotTime;

    @SerializedName(value = "end_time", alternate = {"endTime"})
    private String endTime;

    @SerializedName(value = "alarm_second_by_snapshot", alternate = {"alarmSecondBySnapshot"})
    private Double alarmSecondBySnapshot;

    @SerializedName(value = "alarm_second", alternate = {"alarmSecond"})
    private Double alarmSecond;

    @SerializedName(value = "coords", alternate = {"coords_norm", "bbox", "bounding_box", "boxes", "detections", "detection_results"})
    private JsonElement bboxPayload;

    private String bboxJson;

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
        return firstNonBlank(
                boxedVideoUrl,
                annotatedVideoUrl,
                alarmVideoUrl,
                videoUrl,
                alarmVideoPath,
                rawVideoPath,
                recordingPath,
                clipUrl
        );
    }

    public void setVideoUrl(String videoUrl) {
        this.videoUrl = videoUrl;
    }

    public String getBoxedVideoUrl() {
        return firstNonBlank(boxedVideoUrl, annotatedVideoUrl, alarmVideoUrl);
    }

    public void setBoxedVideoUrl(String boxedVideoUrl) {
        this.boxedVideoUrl = boxedVideoUrl;
    }

    public void setAnnotatedVideoUrl(String annotatedVideoUrl) {
        this.annotatedVideoUrl = annotatedVideoUrl;
    }

    public void setAlarmVideoUrl(String alarmVideoUrl) {
        this.alarmVideoUrl = alarmVideoUrl;
    }

    public void setAlarmVideoPath(String alarmVideoPath) {
        this.alarmVideoPath = alarmVideoPath;
    }

    public void setRawVideoPath(String rawVideoPath) {
        this.rawVideoPath = rawVideoPath;
    }

    public String getClipUrl() {
        return clipUrl;
    }

    public void setClipUrl(String clipUrl) {
        this.clipUrl = clipUrl;
    }

    public double getDurationSeconds() {
        return durationSeconds > 0 ? durationSeconds : (videoDuration == null ? 0 : videoDuration);
    }

    public void setDurationSeconds(double durationSeconds) {
        this.durationSeconds = durationSeconds;
    }

    public String getStartTime() {
        if (startTime != null && !startTime.trim().isEmpty()) return startTime;
        return recordingStartTime;
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

    public Integer getAlarmSecond() {
        Double value = getAlarmSecondValue();
        return value == null ? null : (int) Math.round(value);
    }

    public void setAlarmSecond(Integer alarmSecond) {
        this.alarmSecond = alarmSecond == null ? null : alarmSecond.doubleValue();
    }

    public void setAlarmSecondValue(Double alarmSecond) {
        this.alarmSecond = alarmSecond;
    }

    public Double getAlarmSecondValue() {
        if (alarmSecondBySnapshot != null) return alarmSecondBySnapshot;
        return alarmSecond;
    }

    public void setAlarmSecondBySnapshot(Double alarmSecondBySnapshot) {
        this.alarmSecondBySnapshot = alarmSecondBySnapshot;
    }

    public String getActualClipStart() {
        return firstNonBlank(actualClipStart, getStartTime());
    }

    public void setActualClipStart(String actualClipStart) {
        this.actualClipStart = actualClipStart;
    }

    public String getActualClipEnd() {
        return firstNonBlank(actualClipEnd, endTime);
    }

    public void setActualClipEnd(String actualClipEnd) {
        this.actualClipEnd = actualClipEnd;
    }

    public String getSnapshotTime() {
        return firstNonBlank(snapshotTime, timestamp);
    }

    public void setSnapshotTime(String snapshotTime) {
        this.snapshotTime = snapshotTime;
    }

    public boolean hasBoxedVideoUrl() {
        return !firstNonBlank(boxedVideoUrl, annotatedVideoUrl, alarmVideoUrl).isEmpty();
    }

    public String getBboxJson() {
        if (bboxJson != null && !bboxJson.trim().isEmpty()) return bboxJson;
        return bboxPayload == null || bboxPayload.isJsonNull() ? "" : bboxPayload.toString();
    }

    public void setBboxJson(String bboxJson) {
        this.bboxJson = bboxJson;
    }

    public boolean hasBbox() {
        return !getBboxJson().isEmpty();
    }

    private String firstNonBlank(String... values) {
        for (String value : values) {
            if (value != null && !value.trim().isEmpty() && !"null".equalsIgnoreCase(value.trim())) {
                return value;
            }
        }
        return "";
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
