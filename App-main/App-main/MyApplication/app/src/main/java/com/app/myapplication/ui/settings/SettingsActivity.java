package com.app.myapplication.ui.settings;

import android.os.Bundle;
import android.view.View;
import android.widget.ProgressBar;
import android.widget.Toast;

import androidx.annotation.NonNull;
import androidx.appcompat.app.AppCompatActivity;
import androidx.fragment.app.Fragment;
import androidx.viewpager2.adapter.FragmentStateAdapter;
import androidx.viewpager2.widget.ViewPager2;

import com.app.myapplication.R;
import com.app.myapplication.data.api.ApiClient;
import com.app.myapplication.data.api.SettingsApi;
import com.app.myapplication.data.local.SessionManager;
import com.app.myapplication.data.model.SystemSettings;
import com.google.android.material.button.MaterialButton;
import com.google.android.material.tabs.TabLayout;
import com.google.android.material.tabs.TabLayoutMediator;
import com.google.gson.Gson;
import com.google.gson.JsonObject;

import java.util.HashMap;
import java.util.Map;

import retrofit2.Call;
import retrofit2.Callback;
import retrofit2.Response;

/**
 * 全局设置页面
 * 与 Web 端 SettingsView 对齐
 */
public class SettingsActivity extends AppCompatActivity {

    private ViewPager2 viewPager;
    private TabLayout tabLayout;
    private MaterialButton btnSave;
    private ProgressBar progressBar;

    private SystemSettings settings;
    private SettingsApi api;
    private SessionManager sessionManager;

    // Fragment 引用
    private GeneralSettingsFragment generalFragment;
    private AlarmSettingsFragment alarmFragment;
    private VideoSettingsFragment videoFragment;
    private FenceSettingsFragment fenceFragment;
    private MonitoringSettingsFragment monitoringFragment;
    private LogSettingsFragment logFragment;
    private AccountSettingsFragment accountFragment;
    private NotificationSettingsFragment notificationFragment;
    private BackupSettingsFragment backupFragment;
    private AISettingsFragment aiFragment;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_settings);

        initViews();
        initApi();
        setupViewPager();
        loadSettings();
    }

    private void initViews() {
        viewPager = findViewById(R.id.viewPager);
        tabLayout = findViewById(R.id.tabLayout);
        btnSave = findViewById(R.id.btnSave);
        progressBar = findViewById(R.id.progressBar);

        androidx.appcompat.widget.Toolbar toolbar = findViewById(R.id.toolbar);
        toolbar.setNavigationOnClickListener(v -> finish());

        btnSave.setOnClickListener(v -> saveSettings());
    }

    private void initApi() {
        sessionManager = new SessionManager(this);
        api = ApiClient.get(this).create(SettingsApi.class);
    }

    private void setupViewPager() {
        String[] tabTitles = {"通用", "告警", "视频", "围栏", "监控", "日志", "账号", "通知", "备份", "AI"};

        viewPager.setAdapter(new FragmentStateAdapter(this) {
            @NonNull
            @Override
            public Fragment createFragment(int position) {
                switch (position) {
                    case 0:
                        generalFragment = GeneralSettingsFragment.newInstance(settings);
                        return generalFragment;
                    case 1:
                        alarmFragment = AlarmSettingsFragment.newInstance(settings);
                        return alarmFragment;
                    case 2:
                        videoFragment = VideoSettingsFragment.newInstance(settings);
                        return videoFragment;
                    case 3:
                        fenceFragment = FenceSettingsFragment.newInstance(settings);
                        return fenceFragment;
                    case 4:
                        monitoringFragment = MonitoringSettingsFragment.newInstance(settings);
                        return monitoringFragment;
                    case 5:
                        logFragment = LogSettingsFragment.newInstance(settings);
                        return logFragment;
                    case 6:
                        accountFragment = AccountSettingsFragment.newInstance(settings);
                        return accountFragment;
                    case 7:
                        notificationFragment = NotificationSettingsFragment.newInstance(settings);
                        return notificationFragment;
                    case 8:
                        backupFragment = BackupSettingsFragment.newInstance(settings);
                        return backupFragment;
                    case 9:
                        aiFragment = AISettingsFragment.newInstance(settings);
                        return aiFragment;
                    default:
                        return GeneralSettingsFragment.newInstance(settings);
                }
            }

            @Override
            public int getItemCount() {
                return tabTitles.length;
            }
        });

        new TabLayoutMediator(tabLayout, viewPager, (tab, position) -> {
            tab.setText(tabTitles[position]);
        }).attach();
    }

    private void loadSettings() {
        showLoading(true);

        Map<String, String> headers = new HashMap<>();
        headers.put("Authorization", "Bearer " + sessionManager.getToken());

        api.getSettings(headers).enqueue(new Callback<JsonObject>() {
            @Override
            public void onResponse(Call<JsonObject> call, Response<JsonObject> response) {
                showLoading(false);

                if (response.isSuccessful() && response.body() != null) {
                    Gson gson = new Gson();
                    settings = gson.fromJson(response.body(), SystemSettings.class);
                    if (settings == null) {
                        settings = new SystemSettings();
                    }
                    updateFragments();
                } else {
                    Toast.makeText(SettingsActivity.this, "加载设置失败", Toast.LENGTH_SHORT).show();
                    settings = new SystemSettings();
                    updateFragments();
                }
            }

            @Override
            public void onFailure(Call<JsonObject> call, Throwable t) {
                showLoading(false);
                Toast.makeText(SettingsActivity.this, "网络错误: " + t.getMessage(), Toast.LENGTH_SHORT).show();
                settings = new SystemSettings();
                updateFragments();
            }
        });
    }

    private void updateFragments() {
        // Fragments are created with settings via newInstance, no need to update separately
    }

    private void saveSettings() {
        // 从各个Fragment收集设置
        if (generalFragment != null) generalFragment.collectSettings(settings);
        if (alarmFragment != null) alarmFragment.collectSettings(settings);
        if (videoFragment != null) videoFragment.collectSettings(settings);
        if (fenceFragment != null) fenceFragment.collectSettings(settings);
        if (monitoringFragment != null) monitoringFragment.collectSettings(settings);
        if (logFragment != null) logFragment.collectSettings(settings);
        if (accountFragment != null) accountFragment.collectSettings(settings);
        if (notificationFragment != null) notificationFragment.collectSettings(settings);
        if (backupFragment != null) backupFragment.collectSettings(settings);
        if (aiFragment != null) aiFragment.collectSettings(settings);

        showLoading(true);

        Map<String, String> headers = new HashMap<>();
        headers.put("Authorization", "Bearer " + sessionManager.getToken());

        Gson gson = new Gson();
        JsonObject settingsJson = gson.toJsonTree(settings).getAsJsonObject();

        api.saveSettings(headers, settingsJson).enqueue(new Callback<JsonObject>() {
            @Override
            public void onResponse(Call<JsonObject> call, Response<JsonObject> response) {
                showLoading(false);

                if (response.isSuccessful()) {
                    Toast.makeText(SettingsActivity.this, "设置已保存", Toast.LENGTH_SHORT).show();
                } else {
                    Toast.makeText(SettingsActivity.this, "保存失败", Toast.LENGTH_SHORT).show();
                }
            }

            @Override
            public void onFailure(Call<JsonObject> call, Throwable t) {
                showLoading(false);
                Toast.makeText(SettingsActivity.this, "网络错误: " + t.getMessage(), Toast.LENGTH_SHORT).show();
            }
        });
    }

    private void showLoading(boolean show) {
        progressBar.setVisibility(show ? View.VISIBLE : View.GONE);
        btnSave.setEnabled(!show);
    }

    public SystemSettings getSettings() {
        return settings;
    }
}
