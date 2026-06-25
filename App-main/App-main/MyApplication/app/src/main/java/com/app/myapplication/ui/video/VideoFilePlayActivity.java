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
import androidx.media3.common.VideoSize;
import androidx.media3.datasource.DefaultHttpDataSource;
import androidx.media3.datasource.DefaultDataSource;
import androidx.media3.datasource.DataSource;
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory;
import com.app.myapplication.data.local.AppConfig;
import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

import java.util.ArrayList;
import java.util.List;

public class VideoFilePlayActivity extends AppCompatActivity implements Player.Listener {

    private static final String TAG = "VideoFilePlayActivity";
    private static final String EXTRA_VIDEO_PATH = "video_path";
    private static final String EXTRA_IS_ALARM = "is_alarm";
    private static final String EXTRA_ALARM_SECOND = "alarm_second";
    private static final String EXTRA_ALARM_ID = "alarm_id";
    private static final String EXTRA_SNAPSHOT_TIME = "snapshot_time";
    private static final String EXTRA_ACTUAL_CLIP_START = "actual_clip_start";
    private static final String EXTRA_HAS_BOXED_VIDEO_URL = "has_boxed_video_url";
    private static final String EXTRA_BBOX_JSON = "bbox_json";
    private static final long CENTER_CONTROLS_TIMEOUT_MS = 2500L;
    private PlayerView playerView;
    private AlarmProgressOverlayView alarmProgressOverlay;
    private AlarmBoxOverlayView alarmBoxOverlay;
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
    private boolean alarmBoxShown = false;
    private final Runnable alarmBoxCheckRunnable = new Runnable() {
        @Override
        public void run() {
            maybeShowAlarmBoxesAtCurrentPosition();
            if (!alarmBoxShown && player != null) {
                centerControlsHandler.postDelayed(this, 500L);
            }
        }
    };

    public static void start(Context context, String videoPath) {
        Intent intent = new Intent(context, VideoFilePlayActivity.class);
        intent.putExtra(EXTRA_VIDEO_PATH, videoPath);
        context.startActivity(intent);
    }

    public static void start(Context context, String videoPath, boolean isAlarm, long alarmSecond) {
        start(context, videoPath, isAlarm, alarmSecond, "", "", "", false, "");
    }

    public static void start(
            Context context,
            String videoPath,
            boolean isAlarm,
            double alarmSecond,
            String alarmId,
            String snapshotTime,
            String actualClipStart,
            boolean hasBoxedVideoUrl,
            String bboxJson
    ) {
        Intent intent = new Intent(context, VideoFilePlayActivity.class);
        intent.putExtra(EXTRA_VIDEO_PATH, videoPath);
        intent.putExtra(EXTRA_IS_ALARM, isAlarm);
        intent.putExtra(EXTRA_ALARM_SECOND, alarmSecond);
        intent.putExtra(EXTRA_ALARM_ID, alarmId == null ? "" : alarmId);
        intent.putExtra(EXTRA_SNAPSHOT_TIME, snapshotTime == null ? "" : snapshotTime);
        intent.putExtra(EXTRA_ACTUAL_CLIP_START, actualClipStart == null ? "" : actualClipStart);
        intent.putExtra(EXTRA_HAS_BOXED_VIDEO_URL, hasBoxedVideoUrl);
        intent.putExtra(EXTRA_BBOX_JSON, bboxJson == null ? "" : bboxJson);
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
        alarmBoxOverlay = findViewById(R.id.alarm_box_overlay);
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
                startAlarmBoxWatcherIfNeeded();
                break;
            case Player.STATE_ENDED:
                Log.d(TAG, "STATE_ENDED - Video finished");
                alarmBoxShown = false;
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
        double durationSeconds = durationMs > 0 ? durationMs / 1000d : 0d;
        double alarmSecond = getIntent().getDoubleExtra(EXTRA_ALARM_SECOND, 30d);
        double originalAlarmSecond = alarmSecond;
        if (durationSeconds > 0) {
            alarmSecond = Math.max(0d, Math.min(alarmSecond, durationSeconds));
            if (Math.abs(alarmSecond - originalAlarmSecond) > 0.001d) {
                Log.w(TAG, "alarmSecond out of range, clamped from "
                        + originalAlarmSecond + " to " + alarmSecond
                        + ", videoDuration=" + durationSeconds);
            }
        }
        alarmProgressOverlay.setAlarmMarker(isAlarm, alarmSecond, durationMs);
        logAlarmPlaybackState(alarmSecond, durationSeconds);
    }

    private void logAlarmPlaybackState(double alarmSecond, double durationSeconds) {
        boolean hasBoxedVideoUrl = getIntent().getBooleanExtra(EXTRA_HAS_BOXED_VIDEO_URL, false);
        String bboxJson = getIntent().getStringExtra(EXTRA_BBOX_JSON);
        double markerRatio = durationSeconds > 0 ? Math.max(0d, Math.min(1d, alarmSecond / durationSeconds)) : 0d;
        Log.d(TAG, "alarmId=" + getIntent().getStringExtra(EXTRA_ALARM_ID)
                + ", selectedVideoUrl=" + getIntent().getStringExtra(EXTRA_VIDEO_PATH)
                + ", videoDuration=" + durationSeconds
                + ", alarmSecond=" + alarmSecond
                + ", markerRatio=" + markerRatio
                + ", snapshotTime=" + getIntent().getStringExtra(EXTRA_SNAPSHOT_TIME)
                + ", actualClipStart=" + getIntent().getStringExtra(EXTRA_ACTUAL_CLIP_START)
                + ", hasBoxedVideoUrl=" + hasBoxedVideoUrl
                + ", hasBbox=" + (bboxJson != null && !bboxJson.trim().isEmpty()));
    }

    private void startAlarmBoxWatcherIfNeeded() {
        centerControlsHandler.removeCallbacks(alarmBoxCheckRunnable);
        if (!getIntent().getBooleanExtra(EXTRA_IS_ALARM, false)) return;
        if (getIntent().getBooleanExtra(EXTRA_HAS_BOXED_VIDEO_URL, false)) return;
        String bboxJson = getIntent().getStringExtra(EXTRA_BBOX_JSON);
        if (bboxJson == null || bboxJson.trim().isEmpty()) return;
        alarmBoxShown = false;
        centerControlsHandler.post(alarmBoxCheckRunnable);
    }

    private void maybeShowAlarmBoxesAtCurrentPosition() {
        if (alarmBoxShown || player == null || alarmBoxOverlay == null) return;
        double alarmSecond = getIntent().getDoubleExtra(EXTRA_ALARM_SECOND, 30d);
        long durationMs = player.getDuration();
        if (durationMs > 0) {
            alarmSecond = Math.max(0d, Math.min(alarmSecond, durationMs / 1000d));
        }
        double currentSecond = player.getCurrentPosition() / 1000d;
        if (Math.abs(currentSecond - alarmSecond) > 1.0d) return;

        List<AlarmBoxOverlayView.AlarmBox> boxes = parseAlarmBoxes(getIntent().getStringExtra(EXTRA_BBOX_JSON));
        if (boxes.isEmpty()) return;
        VideoSize size = player.getVideoSize();
        alarmBoxOverlay.setVisibility(View.VISIBLE);
        alarmBoxOverlay.bringToFront();
        alarmBoxOverlay.showBoxes(boxes, 6000, size.width, size.height);
        alarmBoxShown = true;
        Log.d(TAG, "Showing alarm boxes at currentSecond=" + currentSecond
                + ", alarmSecond=" + alarmSecond
                + ", videoSize=" + size.width + "x" + size.height
                + ", boxCount=" + boxes.size());
    }

    private List<AlarmBoxOverlayView.AlarmBox> parseAlarmBoxes(String rawJson) {
        List<AlarmBoxOverlayView.AlarmBox> result = new ArrayList<>();
        if (rawJson == null || rawJson.trim().isEmpty()) return result;
        try {
            JsonElement root = JsonParser.parseString(rawJson);
            collectAlarmBoxes(root, result);
        } catch (Exception e) {
            Log.w(TAG, "Unable to parse alarm bbox json: " + rawJson, e);
        }
        return result;
    }

    private void collectAlarmBoxes(JsonElement element, List<AlarmBoxOverlayView.AlarmBox> result) {
        if (element == null || element.isJsonNull()) return;
        if (element.isJsonArray()) {
            JsonArray array = element.getAsJsonArray();
            float[] directCoords = coordsFromArray(array);
            if (directCoords != null) {
                result.add(new AlarmBoxOverlayView.AlarmBox(directCoords[0], directCoords[1], directCoords[2], directCoords[3], "Alarm"));
                return;
            }
            for (JsonElement child : array) collectAlarmBoxes(child, result);
            return;
        }
        if (!element.isJsonObject()) return;

        JsonObject object = element.getAsJsonObject();
        float[] coords = coordsFromObject(object);
        if (coords != null) {
            result.add(new AlarmBoxOverlayView.AlarmBox(coords[0], coords[1], coords[2], coords[3], labelFromObject(object)));
        }
        for (String key : new String[]{"alarm_boxes", "boxes", "detections", "detection_results", "results"}) {
            if (object.has(key)) collectAlarmBoxes(object.get(key), result);
        }
    }

    private float[] coordsFromObject(JsonObject object) {
        for (String key : new String[]{"coords", "coords_norm", "bbox", "bounding_box", "xyxy", "box"}) {
            if (!object.has(key)) continue;
            JsonElement value = object.get(key);
            if (value.isJsonArray()) {
                float[] coords = coordsFromArray(value.getAsJsonArray());
                if (coords != null) return coords;
            } else if (value.isJsonObject()) {
                JsonObject nested = value.getAsJsonObject();
                if (hasNumbers(nested, "x1", "y1", "x2", "y2")) {
                    return new float[]{
                            nested.get("x1").getAsFloat(),
                            nested.get("y1").getAsFloat(),
                            nested.get("x2").getAsFloat(),
                            nested.get("y2").getAsFloat()
                    };
                }
            }
        }
        if (hasNumbers(object, "x1", "y1", "x2", "y2")) {
            return new float[]{
                    object.get("x1").getAsFloat(),
                    object.get("y1").getAsFloat(),
                    object.get("x2").getAsFloat(),
                    object.get("y2").getAsFloat()
            };
        }
        return null;
    }

    private float[] coordsFromArray(JsonArray array) {
        if (array == null || array.size() < 4) return null;
        for (int i = 0; i < 4; i++) {
            if (!array.get(i).isJsonPrimitive() || !array.get(i).getAsJsonPrimitive().isNumber()) return null;
        }
        return new float[]{
                array.get(0).getAsFloat(),
                array.get(1).getAsFloat(),
                array.get(2).getAsFloat(),
                array.get(3).getAsFloat()
        };
    }

    private boolean hasNumbers(JsonObject object, String... keys) {
        for (String key : keys) {
            if (!object.has(key) || !object.get(key).isJsonPrimitive() || !object.get(key).getAsJsonPrimitive().isNumber()) {
                return false;
            }
        }
        return true;
    }

    private String labelFromObject(JsonObject object) {
        for (String key : new String[]{"label", "class", "class_name", "name", "type"}) {
            if (object.has(key) && object.get(key).isJsonPrimitive()) {
                String text = object.get(key).getAsString();
                if (text != null && !text.trim().isEmpty()) return text;
            }
        }
        return "Alarm";
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
        centerControlsHandler.removeCallbacks(alarmBoxCheckRunnable);
        if (centerControls != null) {
            centerControls.setVisibility(View.GONE);
        }
    }

    @Override
    protected void onDestroy() {
        super.onDestroy();
        centerControlsHandler.removeCallbacks(hideCenterControlsRunnable);
        centerControlsHandler.removeCallbacks(alarmBoxCheckRunnable);
        if (player != null) {
            player.removeListener(this);
            player.release();
            player = null;
        }
    }
}
