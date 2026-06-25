package com.app.myapplication.ui.video;

import android.content.Context;
import android.content.Intent;
import android.content.pm.ActivityInfo;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;
import android.widget.ImageButton;
import android.widget.TextView;
import android.widget.Toast;
import androidx.appcompat.app.AppCompatActivity;
import com.app.myapplication.R;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.common.MediaItem;
import androidx.media3.ui.PlayerView;
import androidx.media3.common.Player;
import androidx.media3.common.PlaybackException;
import androidx.media3.datasource.DefaultHttpDataSource;
import androidx.media3.datasource.DefaultDataSource;
import androidx.media3.datasource.DataSource;
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory;
import com.app.myapplication.data.local.AppConfig;
import com.app.myapplication.data.local.SessionManager;

import java.util.HashMap;
import java.util.Map;

public class VideoFilePlayActivity extends AppCompatActivity implements Player.Listener {

    private static final String TAG = "VideoFilePlayActivity";
    private static final String EXTRA_VIDEO_PATH = "video_path";
    private static final String EXTRA_IS_ALARM = "is_alarm";
    private static final String EXTRA_ALARM_SECOND = "alarm_second";
    private static final long CENTER_CONTROLS_TIMEOUT_MS = 2500L;
    private PlayerView playerView;
    private AlarmProgressOverlayView alarmProgressOverlay;
    private ExoPlayer player;
    private TextView tvTitle;
    private View topBar;
    private View centerControls;
    private ImageButton btnFullscreen;
    private ImageButton btnCenterPlayPause;
    private final Handler centerControlsHandler = new Handler(Looper.getMainLooper());
    private final Runnable hideCenterControlsRunnable = () -> {
        if (centerControls != null) {
            centerControls.setVisibility(View.GONE);
        }
    };
    private boolean isFullscreen = false;

    public static void start(Context context, String videoPath) {
        Intent intent = new Intent(context, VideoFilePlayActivity.class);
        intent.putExtra(EXTRA_VIDEO_PATH, videoPath);
        context.startActivity(intent);
    }

    public static void start(Context context, String videoPath, boolean isAlarm, long alarmSecond) {
        Intent intent = new Intent(context, VideoFilePlayActivity.class);
        intent.putExtra(EXTRA_VIDEO_PATH, videoPath);
        intent.putExtra(EXTRA_IS_ALARM, isAlarm);
        intent.putExtra(EXTRA_ALARM_SECOND, alarmSecond);
        context.startActivity(intent);
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        requestWindowFeature(Window.FEATURE_NO_TITLE);
        getWindow().setFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN, WindowManager.LayoutParams.FLAG_FULLSCREEN);

        setContentView(R.layout.activity_video_file_play);

        playerView = findViewById(R.id.player_view);
        alarmProgressOverlay = findViewById(R.id.alarm_progress_overlay);
        tvTitle = findViewById(R.id.tv_title);
        topBar = findViewById(R.id.top_bar);
        centerControls = findViewById(R.id.center_controls);
        View videoContainer = findViewById(R.id.video_container);
        View videoTapLayer = findViewById(R.id.video_tap_layer);
        ImageButton btnBack = findViewById(R.id.btn_back);
        btnFullscreen = findViewById(R.id.btn_fullscreen);
        btnCenterPlayPause = findViewById(R.id.btn_center_play_pause);
        ImageButton btnCenterRewind = findViewById(R.id.btn_center_rewind);
        ImageButton btnCenterForward = findViewById(R.id.btn_center_forward);
        centerControls.setVisibility(View.GONE);
        centerControls.setOnClickListener(v -> { });

        String videoPath = getIntent().getStringExtra(EXTRA_VIDEO_PATH);
        if (videoPath != null) {
            Log.d(TAG, "Video path: " + videoPath);
            tvTitle.setText(videoPath);
            initPlayer(videoPath);
        }

        btnBack.setOnClickListener(v -> finish());

        btnFullscreen.setOnClickListener(v -> toggleFullscreen());

        View.OnClickListener showCenterControlsClickListener = v -> {
            showCenterControlsTemporarily();
            if (topBar.getVisibility() == View.VISIBLE) {
                topBar.setVisibility(View.GONE);
            } else {
                topBar.setVisibility(View.VISIBLE);
            }
        };
        videoContainer.setOnClickListener(showCenterControlsClickListener);
        videoTapLayer.setOnClickListener(showCenterControlsClickListener);

        btnCenterPlayPause.setOnClickListener(v -> {
            if (player == null) return;
            if (player.isPlaying()) {
                player.pause();
            } else {
                player.play();
            }
            updateCenterPlayPauseIcon();
            showCenterControlsTemporarily();
        });

        btnCenterRewind.setOnClickListener(v -> {
            seekBy(-10000L);
            showCenterControlsTemporarily();
        });

        btnCenterForward.setOnClickListener(v -> {
            seekBy(10000L);
            showCenterControlsTemporarily();
        });
    }

    private void showCenterControlsTemporarily() {
        if (centerControls == null) return;
        updateCenterPlayPauseIcon();
        centerControls.setVisibility(View.VISIBLE);
        centerControls.bringToFront();
        centerControlsHandler.removeCallbacks(hideCenterControlsRunnable);
        centerControlsHandler.postDelayed(hideCenterControlsRunnable, CENTER_CONTROLS_TIMEOUT_MS);
    }

    private void updateCenterPlayPauseIcon() {
        if (btnCenterPlayPause == null || player == null) return;
        btnCenterPlayPause.setImageResource(player.isPlaying() ? R.drawable.ic_pause : R.drawable.ic_play);
    }

    private void seekBy(long offsetMs) {
        if (player == null) return;
        long targetPositionMs = Math.max(0L, player.getCurrentPosition() + offsetMs);
        long durationMs = player.getDuration();
        if (durationMs > 0) {
            targetPositionMs = Math.min(durationMs, targetPositionMs);
        }
        player.seekTo(targetPositionMs);
    }

    private void toggleFullscreen() {
        if (isFullscreen) {
            setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_PORTRAIT);
            topBar.setVisibility(View.VISIBLE);
            btnFullscreen.setImageResource(android.R.drawable.ic_menu_crop);
        } else {
            setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_LANDSCAPE);
            topBar.setVisibility(View.GONE);
            btnFullscreen.setImageResource(android.R.drawable.ic_menu_close_clear_cancel);
        }
        isFullscreen = !isFullscreen;
    }

    private void initPlayer(String videoPath) {
        try {
            Map<String, String> requestHeaders = new HashMap<>();
            String token = SessionManager.getToken(this);
            if (token != null && !token.trim().isEmpty()) {
                String auth = token.trim();
                if (!auth.toLowerCase().startsWith("bearer ")) {
                    auth = "Bearer " + auth;
                }
                requestHeaders.put("Authorization", auth);
            }

            DefaultHttpDataSource.Factory httpDataSourceFactory = new DefaultHttpDataSource.Factory()
                    .setConnectTimeoutMs(10000)
                    .setReadTimeoutMs(10000)
                    .setAllowCrossProtocolRedirects(true)
                    .setDefaultRequestProperties(requestHeaders);

            DataSource.Factory dataSourceFactory = new DefaultDataSource.Factory(this, httpDataSourceFactory);

            DefaultMediaSourceFactory mediaSourceFactory = new DefaultMediaSourceFactory(dataSourceFactory);

            player = new ExoPlayer.Builder(this)
                    .setMediaSourceFactory(mediaSourceFactory)
                    .setSeekBackIncrementMs(10000)
                    .setSeekForwardIncrementMs(10000)
                    .build();

            player.addListener(this);
            playerView.setPlayer(player);
            playerView.setControllerAutoShow(true);
            playerView.setControllerHideOnTouch(false);
            playerView.setControllerShowTimeoutMs(0);
            hidePlayerViewCenterControls();
            playerView.showController();

            String fullUrl = AppConfig.toAbsoluteUrl(this, videoPath);
            Log.d(TAG, "Full URL: " + fullUrl);

            MediaItem mediaItem = MediaItem.fromUri(Uri.parse(fullUrl));
            player.setMediaItem(mediaItem);
            player.prepare();
            player.play();
            playerView.showController();
            hidePlayerViewCenterControls();
            centerControls.setVisibility(View.GONE);
            updateCenterPlayPauseIcon();

            Log.d(TAG, "Player started successfully");
        } catch (Exception e) {
            Log.e(TAG, "Error initializing player: " + e.getMessage(), e);
            Toast.makeText(this, "播放失败: " + e.getMessage(), Toast.LENGTH_LONG).show();
        }
    }

    @Override
    public void onPlaybackStateChanged(int playbackState) {
        Log.d(TAG, "Playback state changed: " + playbackState);
        switch (playbackState) {
            case Player.STATE_IDLE:
                Log.d(TAG, "STATE_IDLE");
                break;
            case Player.STATE_BUFFERING:
                Log.d(TAG, "STATE_BUFFERING");
                break;
            case Player.STATE_READY:
                Log.d(TAG, "STATE_READY - Duration: " + player.getDuration() + "ms");
                playerView.showController();
                hidePlayerViewCenterControls();
                centerControls.setVisibility(View.GONE);
                updateAlarmMarker();
                break;
            case Player.STATE_ENDED:
                Log.d(TAG, "STATE_ENDED - Video finished");
                player.seekTo(0);
                player.play();
                break;
        }
    }

    @Override
    public void onIsPlayingChanged(boolean isPlaying) {
        updateCenterPlayPauseIcon();
    }

    @Override
    public void onPlayerError(PlaybackException error) {
        Log.e(TAG, "Player error: " + error.getMessage(), error);
        Toast.makeText(this, "播放错误: " + error.getMessage(), Toast.LENGTH_LONG).show();
    }

    private void updateAlarmMarker() {
        if (alarmProgressOverlay == null || player == null) return;
        boolean isAlarm = getIntent().getBooleanExtra(EXTRA_IS_ALARM, false);
        long durationMs = player.getDuration();
        long alarmSecond = getIntent().getLongExtra(EXTRA_ALARM_SECOND, 30L);
        if (durationMs > 0 && alarmSecond * 1000L > durationMs) {
            alarmSecond = Math.max(0L, durationMs / 2000L);
        }
        alarmProgressOverlay.setAlarmMarker(isAlarm, alarmSecond, durationMs);
    }

    private void hidePlayerViewCenterControls() {
        hidePlayerViewChild("exo_center_controls");
        hidePlayerViewChild("exo_play_pause");
        hidePlayerViewChild("exo_rew");
        hidePlayerViewChild("exo_ffwd");
        hidePlayerViewChild("exo_prev");
        hidePlayerViewChild("exo_next");
    }

    private void hidePlayerViewChild(String resourceName) {
        if (playerView == null) return;
        int viewId = getResources().getIdentifier(resourceName, "id", getPackageName());
        if (viewId == 0) {
            viewId = getResources().getIdentifier(resourceName, "id", "androidx.media3.ui");
        }
        if (viewId == 0) return;
        View child = playerView.findViewById(viewId);
        if (child != null) {
            child.setVisibility(View.GONE);
        }
    }

    @Override
    protected void onPause() {
        super.onPause();
        centerControlsHandler.removeCallbacks(hideCenterControlsRunnable);
        if (centerControls != null) {
            centerControls.setVisibility(View.GONE);
        }
    }

    @Override
    protected void onDestroy() {
        super.onDestroy();
        centerControlsHandler.removeCallbacks(hideCenterControlsRunnable);
        if (player != null) {
            player.removeListener(this);
            player.release();
            player = null;
        }
    }
}
