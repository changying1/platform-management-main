package com.app.myapplication.ui.video;

import com.app.myapplication.data.model.VideoDevice;

public final class VideoDeviceStatus {
    private VideoDeviceStatus() {}

    public static String raw(VideoDevice device) {
        if (device == null) return "offline";
        String status = device.getStatus();
        if (status != null && !status.trim().isEmpty()) {
            return status.trim().toLowerCase();
        }
        return device.getIsActive() ? "online" : "offline";
    }

    public static String label(VideoDevice device) {
        String status = raw(device);
        if ("online".equals(status)) return "在线";
        if ("sleeping".equals(status)) return "休眠";
        if ("offline".equals(status)) return "离线";
        return status;
    }

    public static boolean isOnline(VideoDevice device) {
        return "online".equals(raw(device));
    }
}
