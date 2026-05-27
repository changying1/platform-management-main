package com.app.myapplication.data.model;

import android.util.Log;

import java.util.Map;

public final class AlarmFields {
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
        alarm.setSnapshotUrl(first(row, "snapshot_url"));
        alarm.setAlarmImagePath(first(row, "alarm_image_path"));
        alarm.setImagePath(first(row, "image_path"));
        alarm.setSnapshotPath(first(row, "snapshot_path"));
        alarm.setImageUrl(first(row, "image_url", "snapshot_url", "alarm_image_path", "image_path", "snapshot_path"));
        alarm.setVideoUrl(first(row, "video_url", "clip_url", "recording_path", "video_path"));
        alarm.setDurationSeconds(intValue(get(row, "duration", "duration_seconds", "video_duration", "clip_duration"), 0));
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

    public static boolean isBlank(String value) {
        return value == null || value.trim().isEmpty() || "null".equalsIgnoreCase(value.trim());
    }
}
