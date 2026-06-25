package com.app.myapplication.data.model;

import android.util.Log;

import com.google.gson.Gson;

import java.util.Map;

public final class AlarmFields {
    private static final Gson GSON = new Gson();

    private AlarmFields() {}

    public static Alarm fromMap(Map<String, Object> row) {
        Alarm alarm = new Alarm();
        alarm.setId(intValue(get(row, "alarm_id", "id"), 0));
        alarm.setDeviceId(text(get(row, "device_id", "deviceId")));
        alarm.setDeviceName(first(row, "device_name", "deviceName", "device", "device_id"));
        alarm.setPersonName(first(row, "person_name", "personnel", "personnel_name", "personName"));
        alarm.setAlarmType(first(row, "alarm_type", "event_type", "type", "rule_name", "algo_name"));
        if (isBlank(alarm.getAlarmType())) alarm.setAlarmType("未知报警类型");
        alarm.setDescription(first(row, "message", "description", "msg"));
        if (isBlank(alarm.getDescription())) {
            String person = isBlank(alarm.getPersonName()) ? "未知人员" : alarm.getPersonName();
            String device = isBlank(alarm.getDeviceName()) ? alarm.getDeviceId() : alarm.getDeviceName();
            alarm.setDescription(person + " - " + alarm.getAlarmType() + "（设备: " + device + "）");
        }
        alarm.setStatus(first(row, "status"));
        if (isBlank(alarm.getStatus())) alarm.setStatus("pending");
        alarm.setSeverity(first(row, "level", "severity", "alarmLevel"));
        if (isBlank(alarm.getSeverity())) alarm.setSeverity("medium");
        alarm.setTimestamp(first(row, "alarm_time", "create_time", "timestamp", "alarmTime"));
        alarm.setLocation(first(row, "location", "position", "device_name", "device_id"));
        if (isBlank(alarm.getLocation())) alarm.setLocation("未知位置");
        alarm.setImageUrlField(first(row, "image_url"));
        alarm.setSnapshotUrl(first(row, "snapshot", "snapshot_url"));
        alarm.setAlarmImagePath(first(row, "alarm_image_path"));
        alarm.setImagePath(first(row, "image_path"));
        alarm.setSnapshotPath(first(row, "snapshot_path"));
        alarm.setImageUrl(first(row, "snapshot", "snapshot_url", "alarm_image_path", "image_url", "image_path", "snapshot_path"));
        alarm.setBoxedVideoUrl(first(row, "boxed_video_url", "boxedVideoUrl"));
        alarm.setAnnotatedVideoUrl(first(row, "annotated_video_url", "annotatedVideoUrl"));
        alarm.setAlarmVideoUrl(first(row, "alarm_video_url", "alarmVideoUrl"));
        alarm.setAlarmVideoPath(first(row, "alarm_video_path", "alarmVideoPath"));
        alarm.setRawVideoPath(first(row, "raw_video_path", "rawVideoPath"));
        alarm.setVideoUrl(first(row, "video_url", "videoUrl", "clip_url", "clipUrl", "recording_path", "recordingPath", "video_path", "videoPath"));
        alarm.setDurationSeconds(doubleValue(get(row, "duration", "duration_seconds", "video_duration", "clip_duration"), 0));
        alarm.setStartTime(first(row, "start_time", "startTime", "recording_start_time", "recordingStartTime"));
        alarm.setActualClipStart(first(row, "actual_clip_start", "actualClipStart", "clip_start", "clipStart", "video_start_time", "videoStartTime"));
        alarm.setEndTime(first(row, "end_time", "endTime", "recording_end_time", "recordingEndTime"));
        alarm.setActualClipEnd(first(row, "actual_clip_end", "actualClipEnd", "clip_end", "clipEnd", "video_end_time", "videoEndTime"));
        alarm.setSnapshotTime(first(row, "snapshot_time", "snapshotTime", "image_time", "imageTime", "capture_time", "captureTime"));
        Object alarmSecondBySnapshot = get(row, "alarm_second_by_snapshot", "alarmSecondBySnapshot");
        if (alarmSecondBySnapshot != null) {
            alarm.setAlarmSecondBySnapshot(doubleValue(alarmSecondBySnapshot, 0));
        }
        Object alarmSecond = get(row, "alarm_second", "alarmSecond");
        if (alarmSecond != null) alarm.setAlarmSecondValue(doubleValue(alarmSecond, 30));
        alarm.setBboxJson(jsonValue(get(row, "coords", "coords_norm", "bbox", "bounding_box", "boxes", "detections", "detection_results")));
        alarm.setRecordingStatus(first(row, "recording_status", "video_status", ""));
        alarm.setRecordingError(first(row, "recording_error", "error_message", ""));
        return alarm;
    }

    public static String first(Map<String, Object> row, String... keys) {
        Object value = get(row, keys);
        String text = text(value);
        return isBlank(text) ? "" : text;
    }

    public static Object get(Map<String, Object> row, String... keys) {
        if (row == null) return null;
        for (String key : keys) {
            if (row.containsKey(key) && !isBlank(text(row.get(key)))) {
                return row.get(key);
            }
        }
        return null;
    }

    public static String text(Object value) {
        if (value == null) return "";
        if (value instanceof Number) {
            double number = ((Number) value).doubleValue();
            if (number == Math.rint(number)) return String.valueOf((long) number);
        }
        String text = value.toString().trim();
        return "null".equalsIgnoreCase(text) ? "" : text;
    }

    public static int intValue(Object value, int fallback) {
        if (value instanceof Number) return ((Number) value).intValue();
        String text = text(value);
        if (text.isEmpty()) return fallback;
        try {
            return Integer.parseInt(text);
        } catch (Exception first) {
            try {
                return (int) Double.parseDouble(text);
            } catch (Exception second) {
                Log.w("AlarmFields", "Invalid integer value: " + text);
                return fallback;
            }
        }
    }

    public static double doubleValue(Object value, double fallback) {
        if (value instanceof Number) return ((Number) value).doubleValue();
        String text = text(value);
        if (text.isEmpty()) return fallback;
        try {
            return Double.parseDouble(text);
        } catch (Exception e) {
            Log.w("AlarmFields", "Invalid double value: " + text);
            return fallback;
        }
    }

    private static String jsonValue(Object value) {
        if (value == null) return "";
        if (value instanceof String) return text(value);
        try {
            return GSON.toJson(value);
        } catch (Exception e) {
            Log.w("AlarmFields", "Invalid bbox json value: " + value);
            return "";
        }
    }

    public static boolean isBlank(String value) {
        return value == null || value.trim().isEmpty() || "null".equalsIgnoreCase(value.trim());
    }
}
