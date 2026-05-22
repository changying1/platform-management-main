package com.app.myapplication.ui.video;

import android.content.Context;
import android.content.Intent;
import android.os.Bundle;
import android.util.Log;
import android.widget.TextView;
import android.view.View;
import androidx.annotation.NonNull;
import androidx.appcompat.app.AppCompatActivity;
import androidx.fragment.app.Fragment;
import androidx.viewpager2.adapter.FragmentStateAdapter;
import androidx.viewpager2.widget.ViewPager2;

import com.app.myapplication.R;
import com.google.android.material.tabs.TabLayout;
import com.google.android.material.tabs.TabLayoutMediator;

public class VideoPlayActivity extends AppCompatActivity {

    private static final String EXTRA_VIDEO_PATH = "video_path";

    public static void start(Context context, String videoPath) {
        Intent intent = new Intent(context, VideoPlayActivity.class);
        intent.putExtra(EXTRA_VIDEO_PATH, videoPath);
        context.startActivity(intent);
    }

    private TextView tvDeviceName;
    private TabLayout tabLayout;
    private ViewPager2 viewPager;

    @Override protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_video_play);

        tvDeviceName = findViewById(R.id.tv_device_name);
        tabLayout = findViewById(R.id.tab_layout);
        viewPager = findViewById(R.id.view_pager);

        String deviceId = readStringExtra("device_id");
        String deviceName = getIntent().getStringExtra("device_name");
        tvDeviceName.setText(deviceName == null ? (deviceId == null ? "设备" : deviceId) : deviceName);

        // 3页：实时、回放、事件
        viewPager.setAdapter(new FragmentStateAdapter(this) {
            @NonNull
            @Override public Fragment createFragment(int position) {
                if (position == 0) return LiveFragment.newInstance(deviceId);
                if (position == 1) return VideoPlaybackFragment.newInstance(deviceId);
                return AlarmEventsFragment.newInstance(deviceId);
            }
            @Override public int getItemCount() { return 3; }
        });

        new TabLayoutMediator(tabLayout, viewPager, (tab, pos) -> {
            if (pos == 0) tab.setText("实时画面");
            else if (pos == 1) tab.setText("录像回放");
            else tab.setText("事件消息");
        }).attach();
    }

    private String readStringExtra(String key) {
        Bundle extras = getIntent().getExtras();
        if (extras == null || !extras.containsKey(key)) return null;

        Object value = extras.get(key);
        return value == null ? null : String.valueOf(value);
    }
}
