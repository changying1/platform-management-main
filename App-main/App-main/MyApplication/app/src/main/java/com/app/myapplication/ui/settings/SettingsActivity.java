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
        String[] tabTitles = {"通用", "告警", "视频", "围栏"};

        viewPager.setAdapter(new FragmentStateAdapter(this) {
            @NonNull
            @Override
            public Fragment createFragment(int position) {
                switch (position) {
                    case 0:
                        generalFragment = new GeneralSettingsFragment();
                        return generalFragment;
                    case 1:
                        alarmFragment = new AlarmSettingsFragment();
                        return alarmFragment;
                    case 2:
                        videoFragment = new VideoSettingsFragment();
                        return videoFragment;
                    case 3:
                        fenceFragment = new FenceSettingsFragment();
                        return fenceFragment;
                    default:
                        return new GeneralSettingsFragment();
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
        if (generalFragment != null) generalFragment.updateSettings(settings);
        if (alarmFragment != null) alarmFragment.updateSettings(settings);
        if (videoFragment != null) videoFragment.updateSettings(settings);
        if (fenceFragment != null) fenceFragment.updateSettings(settings);
    }

    private void saveSettings() {
        // 从各个Fragment收集设置
        if (generalFragment != null) generalFragment.collectSettings(settings);
        if (alarmFragment != null) alarmFragment.collectSettings(settings);
        if (videoFragment != null) videoFragment.collectSettings(settings);
        if (fenceFragment != null) fenceFragment.collectSettings(settings);

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
