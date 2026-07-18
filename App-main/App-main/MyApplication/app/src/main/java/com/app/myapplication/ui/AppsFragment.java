package com.app.myapplication.ui;

import android.content.Intent;
import android.graphics.Color;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.TextView;
import android.widget.Toast;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.appcompat.app.AlertDialog;
import androidx.fragment.app.Fragment;
import androidx.recyclerview.widget.GridLayoutManager;
import androidx.recyclerview.widget.LinearLayoutManager;
import androidx.recyclerview.widget.RecyclerView;

import com.app.myapplication.R;
import com.app.myapplication.data.api.AlarmApi;
import com.app.myapplication.data.api.ApiClient;
import com.app.myapplication.data.api.SettingsApi;
import com.app.myapplication.data.api.VideoApi;
import com.app.myapplication.data.model.Alarm;
import com.app.myapplication.data.model.VideoDevice;
import com.app.myapplication.ui.adapter.NewsAdapter;
import com.app.myapplication.ui.adapter.QuickActionsAdapter;
import com.app.myapplication.ui.alarm.AlarmAdapter;
import com.app.myapplication.ui.alarm.AlarmRecordsActivity;
import com.app.myapplication.ui.call.GroupCallActivity;
import com.app.myapplication.ui.fence.FenceCenterActivity;
import com.app.myapplication.ui.manage.DeviceManagementActivity;
import com.app.myapplication.ui.management.ManagementActivity;
import com.app.myapplication.ui.playback.PlaybackCenterActivity;
import com.app.myapplication.ui.video.VideoCenterActivity;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;

import java.text.ParseException;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Date;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

import retrofit2.Call;
import retrofit2.Callback;
import retrofit2.Response;

public class AppsFragment extends Fragment {

    private static final int DEFAULT_HOME_ALARM_STATS_DAYS = 7;
    private static final int HOME_ALARM_FETCH_LIMIT = 5000;
    private static final int ALARM_FEED_PAGE_SIZE = 3;
    private static final long ALARM_FEED_INTERVAL_MS = 4000L;

    private static final String VIDEO_MONITOR = "\u89C6\u9891\u76D1\u63A7";
    private static final String FENCE_CENTER = "\u7535\u5B50\u56F4\u680F";
    private static final String VOICE_COMMUNICATION = "\u8BED\u97F3\u901A\u4FE1";
    private static final String VIDEO_PLAYBACK = "\u89C6\u9891\u56DE\u653E";
    private static final String TRACK_PLAYBACK = "\u8F68\u8FF9\u56DE\u653E";
    private static final String VOICE_PLAYBACK = "\u901A\u4FE1\u56DE\u653E";
    private static final String ALARM_RECORDS = "\u544A\u8B66\u8BB0\u5F55";
    private static final String PERSONNEL_MANAGEMENT = "\u4EBA\u5458\u7BA1\u7406";
    private static final String DEVICE_MANAGEMENT = "\u8BBE\u5907\u7BA1\u7406";

    private TextView tvOnlineDevices;
    private TextView tvVideoAlarm;
    private TextView tvFenceTrigger;

    private NewsAdapter alarmFeedAdapter;
    private final List<NewsAdapter.NewsItem> noticeItems = new ArrayList<>();
    private final List<NewsAdapter.NewsItem> alarmFeedAll = new ArrayList<>();
    private final List<NewsAdapter.NewsItem> alarmFeedWindow = new ArrayList<>();
    private final Handler feedHandler = new Handler(Looper.getMainLooper());
    private Runnable feedRunnable;
    private int alarmFeedOffset = 0;

    @Nullable
    @Override
    public View onCreateView(@NonNull LayoutInflater inflater,
                             @Nullable ViewGroup container,
                             @Nullable Bundle savedInstanceState) {
        View root = inflater.inflate(R.layout.fragment_apps, container, false);

        bindOverview(root);
        setupQuickActions(root);
        setupInfoColumns(root);
        loadHomeData();

        return root;
    }

    @Override
    public void onDestroyView() {
        feedHandler.removeCallbacksAndMessages(null);
        super.onDestroyView();
    }

    private void bindOverview(View root) {
        tvOnlineDevices = root.findViewById(R.id.tv_online_devices);
        tvVideoAlarm = root.findViewById(R.id.tv_video_alarm);
        tvFenceTrigger = root.findViewById(R.id.tv_fence_trigger);
    }

    private void setupQuickActions(View root) {
        RecyclerView rvQuick = root.findViewById(R.id.rv_quick);
        rvQuick.setLayoutManager(new GridLayoutManager(requireContext(), 3));
        rvQuick.setOverScrollMode(View.OVER_SCROLL_NEVER);

        int spacingPx = (int) (4 * getResources().getDisplayMetrics().density);
        rvQuick.addItemDecoration(new GridSpacingItemDecoration(3, spacingPx, true));

        List<QuickActionsAdapter.Item> quick = new ArrayList<>();
        quick.add(new QuickActionsAdapter.Item(VIDEO_MONITOR, android.R.drawable.ic_menu_slideshow));
        quick.add(new QuickActionsAdapter.Item(FENCE_CENTER, R.drawable.fence));
        quick.add(new QuickActionsAdapter.Item(VOICE_COMMUNICATION, android.R.drawable.ic_btn_speak_now));
        quick.add(new QuickActionsAdapter.Item(VIDEO_PLAYBACK, R.drawable.ic_path_loop));
        quick.add(new QuickActionsAdapter.Item(TRACK_PLAYBACK, android.R.drawable.ic_menu_mapmode));
        quick.add(new QuickActionsAdapter.Item(VOICE_PLAYBACK, android.R.drawable.ic_menu_recent_history));
        quick.add(new QuickActionsAdapter.Item(ALARM_RECORDS, R.drawable.ic_alarm));
        quick.add(new QuickActionsAdapter.Item(PERSONNEL_MANAGEMENT, R.drawable.ic_person));
        quick.add(new QuickActionsAdapter.Item(DEVICE_MANAGEMENT, R.drawable.ic_device));

        rvQuick.setAdapter(new QuickActionsAdapter(quick, item -> {
            switch (item.title) {
                case VIDEO_MONITOR:
                    startActivity(new Intent(requireContext(), VideoCenterActivity.class));
                    break;
                case FENCE_CENTER:
                    startActivity(new Intent(requireContext(), FenceCenterActivity.class));
                    break;
                case VOICE_COMMUNICATION:
                    startActivity(new Intent(requireContext(), GroupCallActivity.class));
                    break;
                case VIDEO_PLAYBACK:
                    openPlayback(PlaybackCenterActivity.TAB_VIDEO);
                    break;
                case TRACK_PLAYBACK:
                    openPlayback(PlaybackCenterActivity.TAB_TRACK);
                    break;
                case VOICE_PLAYBACK:
                    openPlayback(PlaybackCenterActivity.TAB_VOICE);
                    break;
                case ALARM_RECORDS:
                    startActivity(new Intent(requireContext(), AlarmRecordsActivity.class));
                    break;
                case PERSONNEL_MANAGEMENT:
                    openManagement(ManagementActivity.TAB_PERSON);
                    break;
                case DEVICE_MANAGEMENT:
                    startActivity(new Intent(requireContext(), DeviceManagementActivity.class));
                    break;
                default:
                    break;
            }
        }));
    }

    private void setupInfoColumns(View root) {
        View alarmCard = root.findViewById(R.id.card_alarm_feed);
        if (alarmCard != null) {
            alarmCard.setOnClickListener(v ->
                    startActivity(new Intent(requireContext(), AlarmRecordsActivity.class)));
        }

        RecyclerView rvAlarmFeed = root.findViewById(R.id.rv_alarm_feed);
        rvAlarmFeed.setLayoutManager(new LinearLayoutManager(requireContext()));
        alarmFeedAdapter = new NewsAdapter(alarmFeedWindow, item ->
                startActivity(new Intent(requireContext(), AlarmRecordsActivity.class)));
        rvAlarmFeed.setAdapter(alarmFeedAdapter);

        View noticeCard = root.findViewById(R.id.card_notice);
        if (noticeCard != null) {
            noticeCard.setOnClickListener(v -> showAllNoticesDialog());
        }

        RecyclerView rvNotice = root.findViewById(R.id.rv_notice);
        rvNotice.setLayoutManager(new LinearLayoutManager(requireContext()));
        noticeItems.clear();
        noticeItems.add(new NewsAdapter.NewsItem("\u516C\u544A",
                "\u7CFB\u7EDF\u5347\u7EA7\u7EF4\u62A4\u901A\u77E5",
                "\u672C\u5468\u516D 00:00-02:00 \u5347\u7EA7\uFF0C\u56DE\u653E\u53EF\u80FD\u77ED\u6682\u4E0D\u53EF\u7528\u3002",
                "\u5185\u90E8", Color.parseColor("#2563EB")));
        noticeItems.add(new NewsAdapter.NewsItem("\u7EF4\u62A4",
                "\u89C6\u9891\u56DE\u653E\u670D\u52A1\u4F18\u5316",
                "\u56DE\u653E\u52A0\u8F7D\u901F\u5EA6\u63D0\u5347\uFF0C\u5F31\u7F51\u4E0B\u66F4\u6D41\u7545\u3002",
                "\u4ECA\u65E5", Color.parseColor("#7B61FF")));
        noticeItems.add(new NewsAdapter.NewsItem("\u63D0\u9192",
                "\u8BF7\u53CA\u65F6\u5904\u7F6E\u9AD8\u98CE\u9669\u544A\u8B66",
                "\u9AD8\u98CE\u9669\u544A\u8B66\u5EFA\u8BAE\u5F53\u73ED\u5185\u5B8C\u6210\u5904\u7F6E\u95ED\u73AF\u3002",
                "\u957F\u671F", Color.parseColor("#F59E0B")));
        rvNotice.setAdapter(new NewsAdapter(noticeItems, item -> showAllNoticesDialog()));
    }

    private void showAllNoticesDialog() {
        if (!isAdded()) return;
        StringBuilder message = new StringBuilder();
        for (int i = 0; i < noticeItems.size(); i++) {
            NewsAdapter.NewsItem item = noticeItems.get(i);
            if (i > 0) message.append("\n\n");
            message.append("【").append(item.tag).append("】").append(item.title)
                    .append("\n").append(item.desc)
                    .append("\n").append(item.time);
        }
        new AlertDialog.Builder(requireContext())
                .setTitle("\u901A\u77E5\u4E0E\u516C\u544A")
                .setMessage(message.toString())
                .setPositiveButton("\u6211\u77E5\u9053\u4E86", null)
                .show();
    }

    private void loadHomeData() {
        loadOnlineDevices();
        loadAlarmStatsDays();
    }

    private void loadOnlineDevices() {
        VideoApi videoApi = ApiClient.get(requireContext()).create(VideoApi.class);
        videoApi.getDevices(500).enqueue(new Callback<List<VideoDevice>>() {
            @Override
            public void onResponse(@NonNull Call<List<VideoDevice>> call,
                                   @NonNull Response<List<VideoDevice>> response) {
                if (!isAdded()) return;
                int onlineCount = 0;
                List<VideoDevice> devices = response.body();
                if (devices != null) {
                    for (VideoDevice device : devices) {
                        if (isOnlineDevice(device)) onlineCount++;
                    }
                }
                tvOnlineDevices.setText(String.valueOf(onlineCount));
            }

            @Override
            public void onFailure(@NonNull Call<List<VideoDevice>> call, @NonNull Throwable t) {
                if (isAdded()) tvOnlineDevices.setText("--");
            }
        });
    }

    private void loadAlarmStatsDays() {
        SettingsApi settingsApi = ApiClient.get(requireContext()).create(SettingsApi.class);
        settingsApi.getSettings(new HashMap<>()).enqueue(new Callback<JsonObject>() {
            @Override
            public void onResponse(@NonNull Call<JsonObject> call, @NonNull Response<JsonObject> response) {
                int days = readHomeAlarmStatsDays(response.body());
                loadRecentAlarms(days);
            }

            @Override
            public void onFailure(@NonNull Call<JsonObject> call, @NonNull Throwable t) {
                loadRecentAlarms(DEFAULT_HOME_ALARM_STATS_DAYS);
            }
        });
    }

    private void loadRecentAlarms(int days) {
        AlarmApi alarmApi = ApiClient.get(requireContext()).create(AlarmApi.class);
        alarmApi.getAlarmsLimited(HOME_ALARM_FETCH_LIMIT).enqueue(new Callback<List<Alarm>>() {
            @Override
            public void onResponse(@NonNull Call<List<Alarm>> call,
                                   @NonNull Response<List<Alarm>> response) {
                if (!isAdded()) return;
                applyAlarmSummary(response.body(), days);
            }

            @Override
            public void onFailure(@NonNull Call<List<Alarm>> call, @NonNull Throwable t) {
                if (!isAdded()) return;
                tvVideoAlarm.setText("--");
                tvFenceTrigger.setText("--");
                setAlarmFeedPlaceholder("\u544A\u8B66\u6570\u636E\u6682\u65F6\u65E0\u6CD5\u52A0\u8F7D");
            }
        });
    }

    private void applyAlarmSummary(List<Alarm> alarms, int days) {
        int videoCount = 0;
        int fenceCount = 0;
        alarmFeedAll.clear();

        List<Alarm> sorted = new ArrayList<>();
        if (alarms != null) sorted.addAll(alarms);
        Collections.sort(sorted, (a, b) -> Long.compare(timeValue(b), timeValue(a)));

        for (Alarm alarm : sorted) {
            if (alarm == null || isOfflineAlarm(alarm) || !isInRecentDays(alarm, days)) continue;

            String source = AlarmAdapter.sourceType(alarm);
            if ("fence".equals(source)) fenceCount++;
            else videoCount++;

            if (alarmFeedAll.size() < 20) {
                alarmFeedAll.add(toFeedItem(alarm, source));
            }
        }

        tvVideoAlarm.setText(String.valueOf(videoCount));
        tvFenceTrigger.setText(String.valueOf(fenceCount));

        if (alarmFeedAll.isEmpty()) {
            setAlarmFeedPlaceholder("\u8FD1" + days + "\u65E5\u6682\u65E0\u771F\u5B9E\u544A\u8B66\u8BB0\u5F55");
        } else {
            alarmFeedOffset = 0;
            renderAlarmFeedWindow();
            startAlarmFeedLoop();
        }
    }

    private NewsAdapter.NewsItem toFeedItem(Alarm alarm, String source) {
        boolean fence = "fence".equals(source);
        String tag = fence ? "\u56F4\u680F" : "\u89C6\u9891";
        String title = AlarmAdapter.displayType(alarm);
        String desc = first(alarm.getDescription(), alarm.getDeviceName(), alarm.getLocation(), "\u544A\u8B66\u8BE6\u60C5\u5F85\u8865\u5145");
        String time = AlarmAdapter.formatTime(alarm.getTimestamp());
        int color = fence ? Color.parseColor("#22C55E") : Color.parseColor("#FF4D4F");
        return new NewsAdapter.NewsItem(tag, title, desc, time, color);
    }

    private void setAlarmFeedPlaceholder(String message) {
        feedHandler.removeCallbacksAndMessages(null);
        alarmFeedAll.clear();
        alarmFeedWindow.clear();
        alarmFeedWindow.add(new NewsAdapter.NewsItem("\u63D0\u9192",
                "\u6682\u65E0\u544A\u8B66",
                message,
                "--",
                Color.parseColor("#9CA3AF")));
        if (alarmFeedAdapter != null) alarmFeedAdapter.notifyDataSetChanged();
    }

    private void renderAlarmFeedWindow() {
        alarmFeedWindow.clear();
        if (alarmFeedAll.isEmpty()) {
            if (alarmFeedAdapter != null) alarmFeedAdapter.notifyDataSetChanged();
            return;
        }
        int count = Math.min(ALARM_FEED_PAGE_SIZE, alarmFeedAll.size());
        for (int i = 0; i < count; i++) {
            int index = (alarmFeedOffset + i) % alarmFeedAll.size();
            alarmFeedWindow.add(alarmFeedAll.get(index));
        }
        if (alarmFeedAdapter != null) alarmFeedAdapter.notifyDataSetChanged();
    }

    private void startAlarmFeedLoop() {
        feedHandler.removeCallbacksAndMessages(null);
        if (alarmFeedAll.size() <= ALARM_FEED_PAGE_SIZE) return;

        feedRunnable = () -> {
            alarmFeedOffset = (alarmFeedOffset + ALARM_FEED_PAGE_SIZE) % alarmFeedAll.size();
            renderAlarmFeedWindow();
            feedHandler.postDelayed(feedRunnable, ALARM_FEED_INTERVAL_MS);
        };
        feedHandler.postDelayed(feedRunnable, ALARM_FEED_INTERVAL_MS);
    }

    private boolean isOnlineDevice(VideoDevice device) {
        if (device == null || device.getStatus() == null) return false;
        return "online".equalsIgnoreCase(device.getStatus().trim())
                || "\u5728\u7EBF".equals(device.getStatus().trim());
    }

    private int readHomeAlarmStatsDays(JsonObject body) {
        if (body == null) return DEFAULT_HOME_ALARM_STATS_DAYS;
        JsonObject settings = unwrapSettingsObject(body);
        int days = readInt(settings, "dashboardAlarmStatDays", -1);
        if (days <= 0) days = readInt(settings, "homeAlarmStatsDays", -1);
        if (days <= 0) days = readInt(settings, "home_alarm_stats_days", -1);
        if (days <= 0) days = readInt(settings, "homeAlarmDays", -1);
        if (days <= 0) days = readInt(settings, "dashboard_alarm_stat_days", -1);
        return days > 0 ? days : DEFAULT_HOME_ALARM_STATS_DAYS;
    }

    private JsonObject unwrapSettingsObject(JsonObject body) {
        JsonElement data = body.get("data");
        if (data != null && data.isJsonObject()) return data.getAsJsonObject();
        JsonElement settings = body.get("settings");
        if (settings != null && settings.isJsonObject()) return settings.getAsJsonObject();
        return body;
    }

    private int readInt(JsonObject object, String key, int fallback) {
        try {
            if (object != null && object.has(key) && !object.get(key).isJsonNull()) {
                return object.get(key).getAsInt();
            }
        } catch (Exception ignored) {
        }
        return fallback;
    }

    private boolean isInRecentDays(Alarm alarm, int days) {
        Date date = parseAlarmDate(alarm.getTimestamp());
        if (date == null) return false;
        long rangeMs = Math.max(1, days) * 24L * 60L * 60L * 1000L;
        return date.getTime() >= System.currentTimeMillis() - rangeMs;
    }

    private long timeValue(Alarm alarm) {
        Date date = parseAlarmDate(alarm == null ? null : alarm.getTimestamp());
        return date == null ? 0L : date.getTime();
    }

    private Date parseAlarmDate(String raw) {
        if (raw == null || raw.trim().isEmpty()) return null;
        String normalized = normalizeDateValue(raw.trim());
        String[] patterns = new String[]{
                "yyyy-MM-dd'T'HH:mm:ss.SSS",
                "yyyy-MM-dd'T'HH:mm:ss",
                "yyyy-MM-dd HH:mm:ss"
        };
        for (String pattern : patterns) {
            try {
                SimpleDateFormat sdf = new SimpleDateFormat(pattern, Locale.CHINA);
                sdf.setLenient(false);
                return sdf.parse(normalized);
            } catch (ParseException ignored) {
            }
        }
        return null;
    }

    private String normalizeDateValue(String raw) {
        String value = raw.replace("Z", "").replace("+00:00", "");
        int dot = value.indexOf('.');
        if (dot < 0) return value;

        int end = dot + 1;
        while (end < value.length() && Character.isDigit(value.charAt(end))) end++;
        String fraction = value.substring(dot + 1, end);
        if (fraction.length() > 3) fraction = fraction.substring(0, 3);
        while (fraction.length() < 3) fraction += "0";
        return value.substring(0, dot + 1) + fraction + value.substring(end);
    }

    private boolean isOfflineAlarm(Alarm alarm) {
        String text = (safe(alarm.getAlarmType()) + " "
                + safe(alarm.getDisplayAlarmType()) + " "
                + safe(alarm.getDescription()) + " "
                + safe(alarm.getAlarmSource()) + " "
                + safe(alarm.getSourceType())).toLowerCase(Locale.ROOT);
        return text.contains("offline") || text.contains("\u79BB\u7EBF");
    }

    private String first(String... values) {
        for (String value : values) {
            if (value != null && !value.trim().isEmpty() && !"null".equalsIgnoreCase(value.trim())) {
                return value.trim();
            }
        }
        return "";
    }

    private String safe(String value) {
        return value == null ? "" : value.trim();
    }

    private void openPlayback(String tab) {
        Intent intent = new Intent(requireContext(), PlaybackCenterActivity.class);
        intent.putExtra(PlaybackCenterActivity.EXTRA_INITIAL_TAB, tab);
        startActivity(intent);
    }

    private void openManagement(String tab) {
        Intent intent = new Intent(requireContext(), ManagementActivity.class);
        intent.putExtra(ManagementActivity.EXTRA_INITIAL_TAB, tab);
        startActivity(intent);
    }

    public static class AppEntry {
        public final String title;
        public final String subtitle;
        public final int iconRes;
        public final int bgRes;

        public AppEntry(String title, String subtitle, int iconRes, int bgRes) {
            this.title = title;
            this.subtitle = subtitle;
            this.iconRes = iconRes;
            this.bgRes = bgRes;
        }
    }
}
