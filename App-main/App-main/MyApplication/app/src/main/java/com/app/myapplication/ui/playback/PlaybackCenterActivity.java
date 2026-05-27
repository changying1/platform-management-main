package com.app.myapplication.ui.playback;

import android.os.Bundle;
import android.view.View;
import android.widget.ImageButton;

import androidx.annotation.NonNull;
import androidx.appcompat.app.AppCompatActivity;
import androidx.fragment.app.Fragment;
import androidx.fragment.app.FragmentActivity;
import androidx.viewpager2.adapter.FragmentStateAdapter;
import androidx.viewpager2.widget.ViewPager2;

import com.app.myapplication.R;
import com.app.myapplication.ui.track.TrackPlaybackFragment;
import com.app.myapplication.ui.video.VideoPlaybackFragment;
import com.google.android.material.tabs.TabLayout;
import com.google.android.material.tabs.TabLayoutMediator;

import java.util.ArrayList;
import java.util.List;

public class PlaybackCenterActivity extends AppCompatActivity {

    private ImageButton btnBack;
    private TabLayout tabLayout;
    private ViewPager2 viewPager;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_playback_center);

        btnBack = findViewById(R.id.btn_back);
        tabLayout = findViewById(R.id.tab_layout);
        viewPager = findViewById(R.id.view_pager);

        btnBack.setOnClickListener(v -> finish());

        setupViewPager();
    }

    private void setupViewPager() {
        PlaybackPagerAdapter adapter = new PlaybackPagerAdapter(this);
        adapter.addFragment(new VideoPlaybackFragment(), "视频回放");
        adapter.addFragment(new TrackPlaybackFragment(), "轨迹回放");
        adapter.addFragment(new VoicePlaybackFragment(), "语音回放");

        viewPager.setAdapter(adapter);
        viewPager.setOffscreenPageLimit(3);

        new TabLayoutMediator(tabLayout, viewPager, (tab, position) -> {
            tab.setText(adapter.getPageTitle(position));
        }).attach();
    }

    public static class PlaybackPagerAdapter extends FragmentStateAdapter {
        private final List<Fragment> fragments = new ArrayList<>();
        private final List<String> titles = new ArrayList<>();

        public PlaybackPagerAdapter(@NonNull FragmentActivity fragmentActivity) {
            super(fragmentActivity);
        }

        public void addFragment(Fragment fragment, String title) {
            fragments.add(fragment);
            titles.add(title);
        }

        @NonNull
        @Override
        public Fragment createFragment(int position) {
            return fragments.get(position);
        }

        @Override
        public int getItemCount() {
            return fragments.size();
        }

        public String getPageTitle(int position) {
            return titles.get(position);
        }
    }
}
