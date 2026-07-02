package com.app.myapplication.ui;

import android.Manifest;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.media.Ringtone;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;
import android.view.View;
import android.widget.TextView;
import android.widget.Toast;

import androidx.annotation.NonNull;
import androidx.appcompat.app.AlertDialog;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.app.ActivityCompat;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.fragment.app.Fragment;

import com.app.myapplication.R;
import com.app.myapplication.data.api.AlarmApi;
import com.app.myapplication.data.api.ApiClient;
import com.app.myapplication.data.local.AppConfig;
import com.app.myapplication.data.local.SessionManager;
import com.app.myapplication.data.model.Alarm;
import com.app.myapplication.data.model.AlarmFields;
import com.app.myapplication.ui.alarm.AlarmAdapter;
import com.app.myapplication.ui.alarm.AlarmWebSocketClient;
import com.app.myapplication.ui.alarm.ImagePreviewActivity;
import com.google.android.material.bottomnavigation.BottomNavigationView;

import java.util.List;
import java.util.Map;

import retrofit2.Call;
import retrofit2.Callback;
import retrofit2.Response;



public class MainActivity extends AppCompatActivity {

    private static final String ALARM_CHANNEL_ID = "ai_alarm_channel";
    private static final int NOTIFICATION_PERMISSION_REQUEST = 2001;
    private final Handler alarmHandler = new Handler(Looper.getMainLooper());
    private TextView alarmBanner;
    private Long lastAlarmId = null;
    private Long lastShownAlarmDialogId = null;
    private boolean alarmPollRunning = false;
    private Ringtone alarmRingtone;
    private AlertDialog activeAlarmDialog;
    private final AlarmWebSocketClient alarmWebSocketClient = new AlarmWebSocketClient();
    private final Runnable hideAlarmBannerRunnable = () -> {
        if (alarmBanner != null) alarmBanner.setVisibility(View.GONE);
    };
    private final Runnable alarmPollRunnable = new Runnable() {
        @Override
        public void run() {
            pollLatestAlarm();
            if (alarmPollRunning) {
                alarmHandler.postDelayed(this, 5000);
            }
        }
    };
    private BottomNavigationView bottomNav;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        setContentView(R.layout.activity_main);
        bottomNav = findViewById(R.id.bottom_nav);
        alarmBanner = findViewById(R.id.alarm_banner);
        createAlarmNotificationChannel();
        requestNotificationPermissionIfNeeded();

        // 默认显示“应用”
        if (savedInstanceState == null) {
            switchFragment(new AppsFragment());
            bottomNav.setSelectedItemId(R.id.nav_apps);
        }

        bottomNav.setOnItemSelectedListener(item -> {
            int id = item.getItemId();
            if (id == R.id.nav_apps) {
                switchFragment(new AppsFragment());
                return true;
            } else if (id == R.id.nav_me) {
                switchFragment(new MeFragment());
                return true;
            }
            return false;
        });
        startAlarmPolling();
        startAlarmRealtimeSync();
    }

    @Override
    protected void onDestroy() {
        super.onDestroy();
        alarmPollRunning = false;
        alarmHandler.removeCallbacks(alarmPollRunnable);
        alarmHandler.removeCallbacks(hideAlarmBannerRunnable);
        alarmWebSocketClient.close();
        stopAlarmSound();
        if (activeAlarmDialog != null) {
            activeAlarmDialog.dismiss();
            activeAlarmDialog = null;
        }
    }

    private void switchFragment(@NonNull Fragment fragment) {
        getSupportFragmentManager()
                .beginTransaction()
                .replace(R.id.fragment_container, fragment)
                .commit();
    }

    private void startAlarmPolling() {
        if (alarmPollRunning) return;
        if (!new SessionManager(this).hasToken()) {
            Log.w("AIAlarm", "AI alarm polling skipped: no login token");
            return;
        }
        alarmPollRunning = true;
        alarmHandler.post(alarmPollRunnable);
    }

    private void stopAlarmPolling() {
        alarmPollRunning = false;
        alarmHandler.removeCallbacks(alarmPollRunnable);
    }

    private void startAlarmRealtimeSync() {
        if (!new SessionManager(this).hasToken()) {
            Log.w("AIAlarm", "AI alarm websocket skipped: no login token");
            return;
        }
        alarmWebSocketClient.connect(getApplicationContext(), payload -> {
            Alarm alarm = alarmFromPayload(payload);
            if (!shouldPopupAlarm(alarm)) {
                Log.d("AIAlarm", "AI alarm websocket skipped by severity: " + alarm.getSeverity());
                return;
            }
            if (alarm.getId() > 0) {
                lastAlarmId = Math.max(lastAlarmId == null ? 0L : lastAlarmId, alarm.getId());
            }
            Log.d("AIAlarm", "AI alarm websocket received, id=" + alarm.getId() + ", severity=" + alarm.getSeverity());
            showAlarmBanner(alarm);
            showAlarmDialog(alarm);
            showSystemAlarmNotification(alarm);
        });
    }

    private void pollLatestAlarm() {
        Log.d("AIAlarm", "AI alarm poll start");
        ApiClient.get(this).create(AlarmApi.class).getAlarms(0, 1, null)
                .enqueue(new Callback<List<Map<String, Object>>>() {
                    @Override
                    public void onResponse(Call<List<Map<String, Object>>> call, Response<List<Map<String, Object>>> response) {
                        if (!response.isSuccessful() || response.body() == null) {
                            Log.w("AIAlarm", "AI alarm poll failed, code=" + response.code());
                            if (response.code() == 401) {
                                handleAlarmUnauthorized();
                            }
                            return;
                        }
                        Log.d("AIAlarm", "AI alarm poll success, count=" + response.body().size());
                        if (response.body().isEmpty()) return;

                        Alarm alarm = AlarmFields.fromMap(response.body().get(0));
                        long currentId = alarm.getId();
                        if (lastAlarmId == null) {
                            lastAlarmId = currentId;
                            return;
                        }
                        if (currentId <= lastAlarmId) {
                            Log.d("AIAlarm", "AI alarm notification skipped duplicate");
                            return;
                        }
                        lastAlarmId = currentId;
                        if (!shouldPopupAlarm(alarm)) {
                            Log.d("AIAlarm", "AI alarm poll skipped by severity: " + alarm.getSeverity());
                            return;
                        }
                        Log.d("AIAlarm", "AI alarm new detected, id=" + currentId + ", content=" + alarm.getDescription());
                        showAlarmBanner(alarm);
                        showAlarmDialog(alarm);
                        showSystemAlarmNotification(alarm);
                    }

                    @Override
                    public void onFailure(Call<List<Map<String, Object>>> call, Throwable t) {
                        Log.w("AIAlarm", "AI alarm poll failed: " + (t == null ? "unknown" : t.getMessage()));
                    }
                });
    }

    private void handleAlarmUnauthorized() {
        stopAlarmPolling();
        Toast.makeText(this, "登录已失效，请重新登录", Toast.LENGTH_SHORT).show();
    }

    private void showAlarmBanner(Alarm alarm) {
        String content = "【AI报警】" + (alarm.getDescription() == null || alarm.getDescription().trim().isEmpty()
                ? alarm.getAlarmType()
                : AlarmAdapter.cleanDisplayDescription(alarm.getDescription()));
        alarmBanner.setText(content);
        alarmBanner.setVisibility(View.VISIBLE);
        alarmBanner.bringToFront();
        Log.d("AIAlarm", "AI alarm banner shown");
        alarmHandler.removeCallbacks(hideAlarmBannerRunnable);
        alarmHandler.postDelayed(hideAlarmBannerRunnable, 4000);
    }

    private void showAlarmDialog(Alarm alarm) {
        if (alarm == null) return;
        long alarmId = alarm.getId();
        if (alarmId > 0 && lastShownAlarmDialogId != null && lastShownAlarmDialogId == alarmId) {
            return;
        }
        if (alarmId > 0) lastShownAlarmDialogId = alarmId;

        if (activeAlarmDialog != null && activeAlarmDialog.isShowing()) {
            activeAlarmDialog.dismiss();
        }

        String imageUrl = AppConfig.toAbsoluteUrl(this, alarm.getImageUrl());
        String videoUrl = AppConfig.toAbsoluteUrl(this, alarm.getVideoUrl());
        StringBuilder message = new StringBuilder();
        appendLine(message, "类型", alarm.getDisplayAlarmType());
        appendLine(message, "设备", firstNonEmpty(alarm.getDeviceName(), alarm.getDeviceId(), "未知设备"));
        appendLine(message, "时间", firstNonEmpty(alarm.getTimestamp(), "未知时间"));
        if (!imageUrl.isEmpty()) appendLine(message, "截图", imageUrl);
        if (!videoUrl.isEmpty()) appendLine(message, "视频", videoUrl);

        AlertDialog.Builder builder = new AlertDialog.Builder(this)
                .setTitle("新报警")
                .setMessage(message.toString())
                .setNegativeButton("关闭", (dialog, which) -> stopAlarmSound())
                .setOnDismissListener(dialog -> stopAlarmSound());

        if (!videoUrl.isEmpty()) {
            builder.setPositiveButton("查看视频", (dialog, which) -> {
                stopAlarmSound();
                openUrl(videoUrl);
            });
        } else if (!imageUrl.isEmpty()) {
            builder.setPositiveButton("查看截图", (dialog, which) -> {
                stopAlarmSound();
                ImagePreviewActivity.start(this, imageUrl);
            });
        }

        activeAlarmDialog = builder.create();
        activeAlarmDialog.show();
        playAlarmSound();
    }

    private Alarm alarmFromPayload(AlarmWebSocketClient.AlarmPayload payload) {
        Alarm alarm = new Alarm();
        if (payload == null) return alarm;
        alarm.setId(payload.id);
        alarm.setAlarmType(payload.alarmType);
        alarm.setSeverity(payload.severity);
        alarm.setDescription(payload.description);
        alarm.setDeviceId(payload.deviceId);
        alarm.setDeviceName(payload.deviceName);
        alarm.setTimestamp(payload.timestamp);
        alarm.setLocation(payload.location);
        alarm.setImageUrl(payload.imageUrl);
        alarm.setVideoUrl(payload.videoUrl);
        return alarm;
    }

    private boolean shouldPopupAlarm(Alarm alarm) {
        if (alarm == null) return false;
        String severity = normalizeSeverity(alarm.getSeverity());
        return "medium".equals(severity) || "high".equals(severity);
    }

    private String normalizeSeverity(String value) {
        String level = value == null ? "" : value.trim().toLowerCase();
        if (level.isEmpty()) return "medium";
        if ("severe".equals(level) || "serious".equals(level) || "critical".equals(level)
                || "严重".equals(level) || "高级".equals(level) || "高等级".equals(level)) {
            return "high";
        }
        if ("warning".equals(level) || "risk".equals(level) || "medium".equals(level)
                || "中级".equals(level) || "中等级".equals(level) || "风险".equals(level)) {
            return "medium";
        }
        if ("normal".equals(level) || "low".equals(level) || "一般".equals(level)
                || "低级".equals(level) || "低等级".equals(level)) {
            return "low";
        }
        return level;
    }

    private void playAlarmSound() {
        stopAlarmSound();
        try {
            Uri uri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION);
            if (uri == null) uri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE);
            if (uri == null) return;
            alarmRingtone = RingtoneManager.getRingtone(getApplicationContext(), uri);
            if (alarmRingtone != null) {
                alarmRingtone.play();
            }
        } catch (Exception e) {
            Log.w("AIAlarm", "failed to play alarm sound", e);
        }
    }

    private void stopAlarmSound() {
        try {
            if (alarmRingtone != null && alarmRingtone.isPlaying()) {
                alarmRingtone.stop();
            }
        } catch (Exception ignored) {
        }
        alarmRingtone = null;
    }

    private void openUrl(String url) {
        if (url == null || url.trim().isEmpty()) return;
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)));
        } catch (Exception e) {
            Toast.makeText(this, "无法打开报警资源", Toast.LENGTH_SHORT).show();
        }
    }

    private void appendLine(StringBuilder builder, String label, String value) {
        if (builder.length() > 0) builder.append('\n');
        builder.append(label).append(": ").append(value == null || value.trim().isEmpty() ? "-" : value.trim());
    }

    private String firstNonEmpty(String... values) {
        for (String value : values) {
            if (value != null && !value.trim().isEmpty()) return value.trim();
        }
        return "";
    }

    private void showSystemAlarmNotification(Alarm alarm) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU
                && ActivityCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            Log.w("AIAlarm", "AI alarm notification skipped duplicate or permission missing");
            return;
        }
        String content = alarm.getDescription() == null || alarm.getDescription().trim().isEmpty()
                ? alarm.getAlarmType()
                : alarm.getDescription();
        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, ALARM_CHANNEL_ID)
                .setSmallIcon(R.drawable.ic_alarm)
                .setContentTitle("AI报警")
                .setContentText(content)
                .setStyle(new NotificationCompat.BigTextStyle().bigText(content))
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setCategory(NotificationCompat.CATEGORY_ALARM)
                .setAutoCancel(true);
        NotificationManagerCompat.from(this).notify((int) (10000 + alarm.getId()), builder.build());
        Log.d("AIAlarm", "AI alarm notification shown");
    }

    private void createAlarmNotificationChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationChannel channel = new NotificationChannel(
                ALARM_CHANNEL_ID,
                "AI报警",
                NotificationManager.IMPORTANCE_HIGH
        );
        channel.setDescription("AI alarm notifications");
        NotificationManager manager = getSystemService(NotificationManager.class);
        if (manager != null) manager.createNotificationChannel(channel);
    }

    private void requestNotificationPermissionIfNeeded() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU
                && ActivityCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            ActivityCompat.requestPermissions(this, new String[]{Manifest.permission.POST_NOTIFICATIONS}, NOTIFICATION_PERMISSION_REQUEST);
        }
    }
}
