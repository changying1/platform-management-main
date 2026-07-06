package com.app.myapplication.ui.alarm;

import android.graphics.Color;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.TextView;
import android.widget.Toast;

import androidx.annotation.NonNull;
import androidx.recyclerview.widget.RecyclerView;

import com.app.myapplication.R;
import com.app.myapplication.data.local.AppConfig;
import com.app.myapplication.data.model.Alarm;
import com.app.myapplication.ui.video.VideoFilePlayActivity;

import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.List;
import java.util.Locale;

public class AlarmAdapter extends RecyclerView.Adapter<AlarmAdapter.AlarmViewHolder> {
    public interface OnAlarmActionListener {
        void onDetails(Alarm alarm);
        void onHandle(Alarm alarm);
    }

    private final List<Alarm> alarms = new ArrayList<>();
    private OnAlarmActionListener listener;
    private boolean canHandle;

    public void submitList(List<Alarm> list) {
        alarms.clear();
        if (list != null) alarms.addAll(list);
        notifyDataSetChanged();
    }

    public void setOnAlarmActionListener(OnAlarmActionListener listener) {
        this.listener = listener;
    }

    public void setCanHandle(boolean canHandle) {
        this.canHandle = canHandle;
        notifyDataSetChanged();
    }

    @NonNull
    @Override
    public AlarmViewHolder onCreateViewHolder(@NonNull ViewGroup parent, int viewType) {
        return new AlarmViewHolder(LayoutInflater.from(parent.getContext())
                .inflate(R.layout.item_alarm, parent, false));
    }

    @Override
    public void onBindViewHolder(@NonNull AlarmViewHolder h, int position) {
        Alarm alarm = alarms.get(position);
        String source = sourceType(alarm);
        String status = safe(alarm.getDisplayStatus(), "pending");
        String severity = normalizeSeverity(alarm.getDisplaySeverity());

        h.alarmId.setText(buildDisplayId(alarm));
        h.source.setText("fence".equals(source) ? "围栏" : "视频");
        h.type.setText(displayType(alarm));
        h.content.setText(safe(cleanDisplayDescription(alarm.getDescription()), "暂无情况描述"));
        h.device.setText("设备：" + safe(first(alarm.getDeviceName(), alarm.getDeviceId()), "未知设备")
                + (isBlank(alarm.getDeviceId()) ? "" : "  ·  ID " + alarm.getDeviceId()));
        h.orgPath.setText(buildOrgPath(alarm));
        h.time.setText("告警时间：" + formatTime(alarm.getTimestamp()));
        h.level.setText(severityText(severity));
        h.status.setText(statusText(status));
        styleBadge(h.level, severityColor(severity), severityBackground(severity));
        styleBadge(h.status, statusColor(status), statusBackground(status));

        boolean pending = "pending".equals(status);
        h.handle.setVisibility(canHandle && pending ? View.VISIBLE : View.GONE);
        h.image.setVisibility(hasImage(alarm) ? View.VISIBLE : View.GONE);
        h.video.setVisibility(hasVideo(alarm) ? View.VISIBLE : View.GONE);

        h.details.setOnClickListener(v -> {
            if (listener != null) listener.onDetails(alarm);
        });
        h.itemView.setOnClickListener(v -> {
            if (listener != null) listener.onDetails(alarm);
        });
        h.handle.setOnClickListener(v -> {
            if (listener != null) listener.onHandle(alarm);
        });
        h.image.setOnClickListener(v -> openImage(h.itemView, alarm));
        h.video.setOnClickListener(v -> openVideo(h.itemView, alarm));
    }

    private void openImage(View view, Alarm alarm) {
        String url = AppConfig.toAbsoluteUrl(view.getContext(), first(
                alarm.getImageUrlField(), alarm.getSnapshotUrl(), alarm.getAlarmImagePath(),
                alarm.getImagePath(), alarm.getSnapshotPath()));
        if (isBlank(url)) {
            Toast.makeText(view.getContext(), "暂无告警截图", Toast.LENGTH_SHORT).show();
            return;
        }
        ImagePreviewActivity.start(view.getContext(), url);
    }

    private void openVideo(View view, Alarm alarm) {
        String url = AppConfig.toAbsoluteUrl(view.getContext(), alarm.getVideoUrl());
        if (isBlank(url) || alarm.getDurationSeconds() <= 0) {
            Toast.makeText(view.getContext(), videoFailureMessage(alarm), Toast.LENGTH_SHORT).show();
            return;
        }
        VideoFilePlayActivity.start(
                view.getContext(),
                url,
                true,
                resolveAlarmSecond(alarm),
                String.valueOf(alarm.getId()),
                alarm.getSnapshotTime(),
                alarm.getActualClipStart(),
                alarm.hasBoxedVideoUrl(),
                alarm.getBboxJson()
        );
    }

    private static String videoFailureMessage(Alarm alarm) {
        if (!isBlank(alarm.getRecordingError())) return "告警视频生成失败：" + alarm.getRecordingError();
        if ("no_video_segment".equalsIgnoreCase(alarm.getRecordingStatus())) return "所选时段没有可用录像分段";
        if ("failed".equalsIgnoreCase(alarm.getRecordingStatus())
                || "video_failed".equalsIgnoreCase(alarm.getRecordingStatus())) return "录像分段合并失败";
        return "暂无告警视频";
    }

    public static String sourceType(Alarm alarm) {
        String source = safe(first(alarm.getSourceType(), alarm.getAlarmSource()), "").toLowerCase(Locale.ROOT);
        String type = safe(alarm.getAlarmType(), "").toLowerCase(Locale.ROOT);
        String desc = safe(alarm.getDescription(), "");
        return "fence".equals(source) || alarm.getFenceId() != null
                || type.contains("fence") || type.contains("围栏") || desc.contains("围栏")
                ? "fence" : "video";
    }

    public static String displayType(Alarm alarm) {
        String value = safe(alarm.getDisplayAlarmType(), "");
        if (!value.isEmpty() && !"围栏告警".equals(value) && !"视频告警".equals(value)) return value;
        return "fence".equals(sourceType(alarm)) ? "电子围栏闯入" : "视频识别告警";
    }

    public static String cleanDisplayDescription(String value) {
        if (value == null) return "";
        return normalizeAlarmDisplayText(value
                .replaceAll("[\\uFF08(]\\s*\\d{1,3}(?:\\.\\d+)?\\s*%\\s*[\\uFF09)]", "")
                .replaceAll("(?i)\\bconfidence\\s*[:\\uFF1A]?\\s*\\d{1,3}(?:\\.\\d+)?\\s*%?", "")
                .replaceAll("\\u7F6E\\u4FE1\\u5EA6\\s*[:\\uFF1A]?\\s*\\d{1,3}(?:\\.\\d+)?\\s*%?", "")
                .replaceAll("\\s{2,}", " ")
                .trim());
    }

    public static String normalizeAlarmDisplayText(String raw) {
        String text = safe(raw, "");
        if (text.isEmpty()) return "";
        text = replaceAlarmCode(text, "HEIGHT_NO_HELMET", "未佩戴安全帽");
        text = replaceAlarmCode(text, "helmet_missing", "未佩戴安全帽");
        text = replaceAlarmCode(text, "no_helmet", "未佩戴安全帽");
        text = replaceAlarmCode(text, "NO_HELMET", "未佩戴安全帽");
        text = replaceAlarmCode(text, "no_vest", "未穿反光衣");
        text = replaceAlarmCode(text, "NO_VEST", "未穿反光衣");
        text = replaceAlarmCode(text, "person_fall", "人员倒地");
        text = replaceAlarmCode(text, "PERSON_FALL", "人员倒地");
        text = replaceAlarmCode(text, "ladder_angle", "梯子角度违规");
        text = replaceAlarmCode(text, "LADDER_ANGLE", "梯子角度违规");
        text = replaceAlarmCode(text, "intrusion", "区域入侵");
        text = replaceAlarmCode(text, "INTRUSION", "区域入侵");
        text = replaceAlarmCode(text, "phone_call", "发现打电话");
        text = replaceAlarmCode(text, "calling", "发现打电话");
        text = replaceAlarmCode(text, "phone", "发现打电话");
        text = replaceAlarmCode(text, "smoking", "吸烟");
        text = replaceAlarmCode(text, "open_fire", "发现明火");
        text = replaceAlarmCode(text, "flame", "发现明火");
        text = replaceAlarmCode(text, "smoke", "发现烟雾");
        text = replaceAlarmCode(text, "SMOKE", "发现烟雾");
        text = replaceAlarmCode(text, "fire", "发现明火");
        text = replaceAlarmCode(text, "FIRE", "发现明火");
        return text
                .replace("烟火检测:", "烟火检测：")
                .replace("安全帽检测:", "安全帽检测：")
                .replace("反光衣检测:", "反光衣检测：")
                .replace("区域检测:", "区域检测：")
                .replace("吸烟检测:", "吸烟检测：")
                .replace("打电话检测:", "打电话检测：")
                .replace("  ", " ")
                .trim();
    }

    private static String replaceAlarmCode(String text, String code, String label) {
        if (text == null || text.isEmpty()) return "";
        return text.replace(code, label);
    }

    public static String buildDisplayId(Alarm alarm) {
        String date = safe(alarm.getTimestamp(), "").replace("-", "");
        if (date.length() >= 8) date = date.substring(0, 8);
        else date = "00000000";
        return "ALM-" + date + "-" + alarm.getId();
    }

    public static String buildOrgPath(Alarm alarm) {
        List<String> parts = new ArrayList<>();
        add(parts, alarm.getBranchName());
        add(parts, alarm.getProjectName());
        add(parts, alarm.getGridName());
        add(parts, alarm.getTeamName());
        return parts.isEmpty() ? "组织归属：未分配" : "组织归属：" + android.text.TextUtils.join(" / ", parts);
    }

    public static String formatTime(String raw) {
        if (isBlank(raw)) return "-";
        String normalized = raw.trim().replace("Z", "").replace("+00:00", "");
        String[] patterns = {"yyyy-MM-dd'T'HH:mm:ss.SSSSSS", "yyyy-MM-dd'T'HH:mm:ss", "yyyy-MM-dd HH:mm:ss"};
        for (String pattern : patterns) {
            try {
                Date date = new SimpleDateFormat(pattern, Locale.US).parse(normalized);
                if (date != null) return new SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.CHINA).format(date);
            } catch (Exception ignored) {}
        }
        return raw;
    }

    private static double resolveAlarmSecond(Alarm alarm) {
        Double backendSecond = alarm.getAlarmSecondValue();
        if (backendSecond != null) return Math.max(0d, backendSecond);
        return alarm.getDurationSeconds() > 0 && alarm.getDurationSeconds() < 30
                ? Math.max(0d, alarm.getDurationSeconds() / 2d) : 30d;
    }

    private static boolean hasImage(Alarm alarm) {
        return !isBlank(first(alarm.getImageUrlField(), alarm.getSnapshotUrl(),
                alarm.getAlarmImagePath(), alarm.getImagePath(), alarm.getSnapshotPath()));
    }

    private static boolean hasVideo(Alarm alarm) {
        if ("fence".equals(sourceType(alarm))) return false;
        return !isBlank(alarm.getVideoUrl()) || !isBlank(alarm.getRecordingStatus());
    }

    private static String normalizeSeverity(String value) {
        value = safe(value, "low").toLowerCase(Locale.ROOT);
        if (value.equals("high") || value.equals("severe") || value.equals("critical") || value.equals("danger")) return "high";
        if (value.equals("medium") || value.equals("warning")) return "medium";
        return "low";
    }

    private static String severityText(String value) {
        return "high".equals(value) ? "严重" : "medium".equals(value) ? "一般" : "提示";
    }

    private static String statusText(String value) {
        return "resolved".equals(value) ? "已处理" : "ignored".equals(value) ? "已忽略" : "待处理";
    }

    private static int severityColor(String value) {
        return "high".equals(value) ? Color.rgb(198, 40, 40)
                : "medium".equals(value) ? Color.rgb(230, 81, 0) : Color.rgb(25, 103, 210);
    }

    private static int severityBackground(String value) {
        return "high".equals(value) ? Color.rgb(255, 235, 238)
                : "medium".equals(value) ? Color.rgb(255, 243, 224) : Color.rgb(232, 240, 254);
    }

    private static int statusColor(String value) {
        return "resolved".equals(value) ? Color.rgb(46, 125, 50)
                : "ignored".equals(value) ? Color.DKGRAY : Color.rgb(245, 124, 0);
    }

    private static int statusBackground(String value) {
        return "resolved".equals(value) ? Color.rgb(232, 245, 233)
                : "ignored".equals(value) ? Color.rgb(238, 238, 238) : Color.rgb(255, 248, 225);
    }

    private static void styleBadge(TextView view, int textColor, int backgroundColor) {
        view.setTextColor(textColor);
        android.graphics.drawable.GradientDrawable background = new android.graphics.drawable.GradientDrawable();
        background.setColor(backgroundColor);
        background.setCornerRadius(100);
        view.setBackground(background);
    }

    private static void add(List<String> values, String value) {
        if (!isBlank(value)) values.add(value.trim());
    }

    private static String first(String... values) {
        for (String value : values) if (!isBlank(value)) return value.trim();
        return "";
    }

    private static String safe(String value, String fallback) {
        return isBlank(value) ? fallback : value.trim();
    }

    private static boolean isBlank(String value) {
        return value == null || value.trim().isEmpty() || "null".equalsIgnoreCase(value.trim());
    }

    @Override public int getItemCount() { return alarms.size(); }

    static class AlarmViewHolder extends RecyclerView.ViewHolder {
        final TextView alarmId, source, type, content, device, orgPath, time, level, status;
        final Button image, video, handle, details;

        AlarmViewHolder(@NonNull View itemView) {
            super(itemView);
            alarmId = itemView.findViewById(R.id.tvAlarmId);
            source = itemView.findViewById(R.id.tvSourceBadge);
            type = itemView.findViewById(R.id.tvAlarmType);
            content = itemView.findViewById(R.id.tvAlarmContent);
            device = itemView.findViewById(R.id.tvDevice);
            orgPath = itemView.findViewById(R.id.tvOrgPath);
            time = itemView.findViewById(R.id.tvTime);
            level = itemView.findViewById(R.id.tvLevelBadge);
            status = itemView.findViewById(R.id.tvStatusBadge);
            image = itemView.findViewById(R.id.btnImage);
            video = itemView.findViewById(R.id.btnVideo);
            handle = itemView.findViewById(R.id.btnResolve);
            details = itemView.findViewById(R.id.btnDetails);
        }
    }
}
