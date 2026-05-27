package com.app.myapplication.ui;

import android.Manifest;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;
import android.view.View;
import android.widget.TextView;

import androidx.annotation.NonNull;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.app.ActivityCompat;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.fragment.app.Fragment;

import com.app.myapplication.R;
import com.app.myapplication.data.api.AlarmApi;
import com.app.myapplication.data.api.ApiClient;
import com.app.myapplication.data.model.Alarm;
import com.app.myapplication.data.model.AlarmFields;
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
    private boolean alarmPollRunning = false;
    private final Runnable hideAlarmBannerRunnable = () -> {
        if (alarmBanner != null) alarmBanner.setVisibility(View.GONE);
    };
    private final Runnable alarmPollRunnable = new Runnable() {
        @Override
        public void run() {
            pollLatestAlarm();
            alarmHandler.postDelayed(this, 5000);
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
    }

    @Override
    protected void onDestroy() {
        super.onDestroy();
        alarmPollRunning = false;
        alarmHandler.removeCallbacks(alarmPollRunnable);
        alarmHandler.removeCallbacks(hideAlarmBannerRunnable);
    }

    private void switchFragment(@NonNull Fragment fragment) {
        getSupportFragmentManager()
                .beginTransaction()
                .replace(R.id.fragment_container, fragment)
                .commit();
    }

    private void startAlarmPolling() {
        if (alarmPollRunning) return;
        alarmPollRunning = true;
        alarmHandler.post(alarmPollRunnable);
    }

    private void pollLatestAlarm() {
        Log.d("AIAlarm", "AI alarm poll start");
        ApiClient.get(this).create(AlarmApi.class).getAlarms(0, 1, null)
                .enqueue(new Callback<List<Map<String, Object>>>() {
                    @Override
                    public void onResponse(Call<List<Map<String, Object>>> call, Response<List<Map<String, Object>>> response) {
                        if (!response.isSuccessful() || response.body() == null) {
                            Log.w("AIAlarm", "AI alarm poll failed, code=" + response.code());
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
                        Log.d("AIAlarm", "AI alarm new detected, id=" + currentId + ", content=" + alarm.getDescription());
                        showAlarmBanner(alarm);
                        showSystemAlarmNotification(alarm);
                    }

                    @Override
                    public void onFailure(Call<List<Map<String, Object>>> call, Throwable t) {
                        Log.w("AIAlarm", "AI alarm poll failed: " + (t == null ? "unknown" : t.getMessage()));
                    }
                });
    }

    private void showAlarmBanner(Alarm alarm) {
        String content = "【AI报警】" + (alarm.getDescription() == null || alarm.getDescription().trim().isEmpty()
                ? alarm.getAlarmType()
                : alarm.getDescription());
        alarmBanner.setText(content);
        alarmBanner.setVisibility(View.VISIBLE);
        alarmBanner.bringToFront();
        Log.d("AIAlarm", "AI alarm banner shown");
        alarmHandler.removeCallbacks(hideAlarmBannerRunnable);
        alarmHandler.postDelayed(hideAlarmBannerRunnable, 4000);
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
