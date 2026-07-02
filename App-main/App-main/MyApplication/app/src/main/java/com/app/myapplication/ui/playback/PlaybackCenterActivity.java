package com.app.myapplication.ui.playback;

import android.os.Bundle;
import android.view.View;
import android.widget.ImageButton;
import android.widget.TextView;

import androidx.appcompat.app.AppCompatActivity;
import androidx.fragment.app.Fragment;

import com.app.myapplication.R;
import com.app.myapplication.ui.track.TrackPlaybackFragment;
import com.app.myapplication.ui.video.VideoPlaybackFragment;

public class PlaybackCenterActivity extends AppCompatActivity {
    public static final String EXTRA_INITIAL_TAB = "initial_tab";
    public static final String TAB_VIDEO = "video";
    public static final String TAB_TRACK = "track";
    public static final String TAB_VOICE = "voice";

    private ImageButton btnBack;
    private TextView tvTitle;
    private View layoutHeader;
    private View viewDivider;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_playback_center);

        btnBack = findViewById(R.id.btn_back);
        tvTitle = findViewById(R.id.tv_title);
        layoutHeader = findViewById(R.id.layout_playback_header);
        viewDivider = findViewById(R.id.view_playback_divider);

        btnBack.setOnClickListener(v -> finish());

        if (savedInstanceState == null) {
            openRequestedPlayback();
        } else {
            updateTitle(resolvePlaybackType());
        }
    }

    private void openRequestedPlayback() {
        String type = resolvePlaybackType();
        updateTitle(type);
        getSupportFragmentManager()
                .beginTransaction()
                .replace(R.id.fragment_container, createFragment(type))
                .commit();
    }

    private String resolvePlaybackType() {
        String type = getIntent().getStringExtra(EXTRA_INITIAL_TAB);
        if (TAB_TRACK.equals(type) || TAB_VOICE.equals(type)) {
            return type;
        }
        return TAB_VIDEO;
    }

    private Fragment createFragment(String type) {
        if (TAB_TRACK.equals(type)) {
            return new TrackPlaybackFragment();
        }
        if (TAB_VOICE.equals(type)) {
            return new VoicePlaybackFragment();
        }
        return new VideoPlaybackFragment();
    }

    private void updateTitle(String type) {
        if (tvTitle == null) return;
        if (TAB_TRACK.equals(type)) {
            tvTitle.setText("轨迹回放");
        } else if (TAB_VOICE.equals(type)) {
            tvTitle.setText("通信回放");
        } else {
            tvTitle.setText("视频回放");
        }
    }

    public void setHeaderVisible(boolean visible) {
        int visibility = visible ? View.VISIBLE : View.GONE;
        if (layoutHeader != null) {
            layoutHeader.setVisibility(visibility);
        }
        if (viewDivider != null) {
            viewDivider.setVisibility(visibility);
        }
    }
}
