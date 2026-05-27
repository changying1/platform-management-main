package com.app.myapplication.ui.video;

import android.content.Context;
import android.content.Intent;
import android.content.pm.ActivityInfo;
import android.net.Uri;
import android.os.Bundle;
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

public class VideoFilePlayActivity extends AppCompatActivity implements Player.Listener {

    private static final String TAG = "VideoFilePlayActivity";
    private static final String EXTRA_VIDEO_PATH = "video_path";
    private PlayerView playerView;
    private ExoPlayer player;
    private TextView tvTitle;
    private View topBar;
    private ImageButton btnFullscreen;
    private boolean isFullscreen = false;

    public static void start(Context context, String videoPath) {
        Intent intent = new Intent(context, VideoFilePlayActivity.class);
        intent.putExtra(EXTRA_VIDEO_PATH, videoPath);
        context.startActivity(intent);
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        requestWindowFeature(Window.FEATURE_NO_TITLE);
        getWindow().setFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN, WindowManager.LayoutParams.FLAG_FULLSCREEN);

        setContentView(R.layout.activity_video_file_play);

        playerView = findViewById(R.id.player_view);
        tvTitle = findViewById(R.id.tv_title);
        topBar = findViewById(R.id.top_bar);
        ImageButton btnBack = findViewById(R.id.btn_back);
        btnFullscreen = findViewById(R.id.btn_fullscreen);

        String videoPath = getIntent().getStringExtra(EXTRA_VIDEO_PATH);
        if (videoPath != null) {
            Log.d(TAG, "Video path: " + videoPath);
            tvTitle.setText(videoPath);
            initPlayer(videoPath);
        }

        btnBack.setOnClickListener(v -> finish());

        btnFullscreen.setOnClickListener(v -> toggleFullscreen());

        playerView.setOnClickListener(v -> {
            if (topBar.getVisibility() == View.VISIBLE) {
                topBar.setVisibility(View.GONE);
            } else {
                topBar.setVisibility(View.VISIBLE);
            }
        });
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
            DefaultHttpDataSource.Factory httpDataSourceFactory = new DefaultHttpDataSource.Factory()
                    .setConnectTimeoutMs(10000)
                    .setReadTimeoutMs(10000)
                    .setAllowCrossProtocolRedirects(true);

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
            playerView.setControllerHideOnTouch(true);

            String fullUrl = AppConfig.toAbsoluteUrl(this, videoPath);
            Log.d(TAG, "Full URL: " + fullUrl);

            MediaItem mediaItem = MediaItem.fromUri(Uri.parse(fullUrl));
            player.setMediaItem(mediaItem);
            player.prepare();
            player.play();

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
                break;
            case Player.STATE_ENDED:
                Log.d(TAG, "STATE_ENDED - Video finished");
                player.seekTo(0);
                player.play();
                break;
        }
    }

    @Override
    public void onPlayerError(PlaybackException error) {
        Log.e(TAG, "Player error: " + error.getMessage(), error);
        Toast.makeText(this, "播放错误: " + error.getMessage(), Toast.LENGTH_LONG).show();
    }

    @Override
    protected void onDestroy() {
        super.onDestroy();
        if (player != null) {
            player.removeListener(this);
            player.release();
            player = null;
        }
    }
}
