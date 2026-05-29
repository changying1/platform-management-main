package com.app.myapplication.ui.video;

import android.net.Uri;
import android.os.Bundle;
import android.util.Log;
import android.view.Gravity;
import android.view.LayoutInflater;
import android.view.MotionEvent;
import android.view.View;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.CheckBox;
import android.widget.FrameLayout;
import android.widget.ImageButton;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;

import androidx.appcompat.app.AlertDialog;
import androidx.annotation.NonNull;
import androidx.fragment.app.Fragment;
import androidx.media3.common.MediaItem;
import androidx.media3.common.PlaybackException;
import androidx.media3.common.Player;
import androidx.media3.common.VideoSize;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.ui.PlayerView;
import androidx.recyclerview.widget.LinearLayoutManager;
import androidx.recyclerview.widget.RecyclerView;

import com.app.myapplication.BuildConfig;
import com.app.myapplication.R;
import com.app.myapplication.data.api.ApiClient;
import com.app.myapplication.data.api.VideoApi;
import com.app.myapplication.data.local.AppConfig;
import com.app.myapplication.data.model.LiveStreamInfo;
import com.app.myapplication.ui.video.ezviz.EzvizPlayerManager;
import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.WebSocket;
import okhttp3.WebSocketListener;
import retrofit2.Call;
import retrofit2.Callback;
import retrofit2.Response;

public class LiveFragment extends Fragment {

    private static final String ARG_DEVICE_ID = "device_id";
    private static final String TAG = "LiveFragment";

    public static LiveFragment newInstance(String deviceId) {
        Bundle b = new Bundle();
        b.putString(ARG_DEVICE_ID, deviceId);
        LiveFragment f = new LiveFragment();
        f.setArguments(b);
        return f;
    }

    private PlayerView playerView;
    private FrameLayout ezvizPlayerContainer;
    private AlarmBoxOverlayView alarmOverlayView;
    private TextView tvPlayerStatus;
    private ImageButton btnPlayPause;
    private ImageButton btnFullscreen;
    private ImageButton ptzUp;
    private ImageButton ptzDown;
    private ImageButton ptzLeft;
    private ImageButton ptzRight;
    private Button btnZoomIn;
    private Button btnZoomOut;
    private Button btnPresets;
    private Button btnPresetAdd;
    private Button btnPresetClear;
    private Button btnCruiseStart;
    private Button btnCruiseStop;
    private Button btnCruiseStatus;
    private Button tabPresets;
    private Button tabPtz;
    private Button tabAi;
    private View panelPresets;
    private View panelPtz;
    private View panelAi;
    private RecyclerView rvPresets;
    private TextView tvPresetsEmpty;
    private PresetAdapter presetAdapter;
    private LinearLayout aiRuleContainer;
    private TextView tvAiStatus;
    private Button btnAiSaveRules;
    private Button btnAiStart;
    private Button btnAiStop;

    private ExoPlayer player;
    private EzvizPlayerManager ezvizPlayerManager;
    private Call<LiveStreamInfo> liveStreamCall;
    private boolean isPlaying = false;
    private boolean streamPrepared = false;
    private boolean isEzvizMode = false;
    private String currentPlayUrl;
    private String currentPlayType;
    private boolean openingFullscreen = false;
    private boolean shouldResumeAfterFullscreen = false;
    private String deviceId;
    private int videoId = -1;
    private boolean invalidDeviceId = false;
    private final List<Map<String, Object>> presetCache = new ArrayList<>();
    private final Map<String, CheckBox> aiRuleCheckBoxes = new LinkedHashMap<>();
    private final OkHttpClient alarmSocketClient = new OkHttpClient();
    private WebSocket alarmWebSocket;

    @Override
    public View onCreateView(@NonNull LayoutInflater inflater, ViewGroup container, Bundle savedInstanceState) {
        return inflater.inflate(R.layout.fragment_live, container, false);
    }

    @Override
    public void onViewCreated(@NonNull View v, Bundle savedInstanceState) {
        playerView = v.findViewById(R.id.player_view);
        ezvizPlayerContainer = v.findViewById(R.id.ezviz_player_container);
        alarmOverlayView = v.findViewById(R.id.alarm_overlay_view);
        tvPlayerStatus = v.findViewById(R.id.tv_player_status);
        btnPlayPause = v.findViewById(R.id.btn_play_pause);
        btnFullscreen = v.findViewById(R.id.btn_fullscreen);

        ptzUp = v.findViewById(R.id.ptz_up);
        ptzDown = v.findViewById(R.id.ptz_down);
        ptzLeft = v.findViewById(R.id.ptz_left);
        ptzRight = v.findViewById(R.id.ptz_right);
        btnZoomIn = v.findViewById(R.id.btn_zoom_in);
        btnZoomOut = v.findViewById(R.id.btn_zoom_out);
        btnPresets = v.findViewById(R.id.btn_presets);
        btnPresetAdd = v.findViewById(R.id.btn_preset_add);
        btnPresetClear = v.findViewById(R.id.btn_preset_clear);
        btnCruiseStart = v.findViewById(R.id.btn_cruise_start);
        btnCruiseStop = v.findViewById(R.id.btn_cruise_stop);
        btnCruiseStatus = v.findViewById(R.id.btn_cruise_status);
        tabPresets = v.findViewById(R.id.tab_presets);
        tabPtz = v.findViewById(R.id.tab_ptz);
        tabAi = v.findViewById(R.id.tab_ai);
        panelPresets = v.findViewById(R.id.panel_presets);
        panelPtz = v.findViewById(R.id.panel_ptz);
        panelAi = v.findViewById(R.id.panel_ai);
        rvPresets = v.findViewById(R.id.rv_presets);
        tvPresetsEmpty = v.findViewById(R.id.tv_presets_empty);
        aiRuleContainer = v.findViewById(R.id.ai_rule_container);
        tvAiStatus = v.findViewById(R.id.tv_ai_status);
        btnAiSaveRules = v.findViewById(R.id.btn_ai_save_rules);
        btnAiStart = v.findViewById(R.id.btn_ai_start);
        btnAiStop = v.findViewById(R.id.btn_ai_stop);

        presetAdapter = new PresetAdapter();
        rvPresets.setLayoutManager(new LinearLayoutManager(requireContext()));
        rvPresets.setAdapter(presetAdapter);
        updatePresetListView();

        ezvizPlayerManager = new EzvizPlayerManager(requireContext(), ezvizPlayerContainer, new EzvizPlayerManager.Callback() {
            @Override
            public void onConnecting() {
                showPlayerStatus("正在连接萤石云视频");
            }

            @Override
            public void onPlaying() {
                showPlayerStatus("萤石云视频播放中");
                streamPrepared = true;
                isPlaying = true;
                btnPlayPause.setImageResource(android.R.drawable.ic_media_pause);
            }

            @Override
            public void onError(String message) {
                showPlayerStatus("萤石云视频播放失败: " + message);
                streamPrepared = false;
                isPlaying = false;
                btnPlayPause.setImageResource(android.R.drawable.ic_media_play);
                Toast.makeText(requireContext(), "萤石云视频播放失败: " + message, Toast.LENGTH_LONG).show();
            }
        });

        deviceId = getArguments() != null ? getArguments().getString(ARG_DEVICE_ID) : "1";
        try {
            videoId = Integer.parseInt(deviceId);
            invalidDeviceId = false;
        } catch (NumberFormatException e) {
            videoId = -1;
            invalidDeviceId = true;
        }
        connectAlarmWebSocket();

        btnPlayPause.setOnClickListener(view -> {
            if (!streamPrepared) {
                prepareLiveStream();
            } else {
                togglePlayPause();
            }
        });

        btnFullscreen.setOnClickListener(view -> {
            if (safeTrim(currentPlayUrl).isEmpty()) {
                Toast.makeText(requireContext(), "直播地址未准备好，请先播放直播", Toast.LENGTH_SHORT).show();
                return;
            }
            openFullscreen();
        });

        bindContinuousControl(ptzUp, "ptz", "up");
        bindContinuousControl(ptzDown, "ptz", "down");
        bindContinuousControl(ptzLeft, "ptz", "left");
        bindContinuousControl(ptzRight, "ptz", "right");
        bindContinuousControl(btnZoomIn, "zoom", "zoom_in");
        bindContinuousControl(btnZoomOut, "zoom", "zoom_out");
        btnPresets.setOnClickListener(view -> fetchPresets(true));
        btnPresetAdd.setOnClickListener(view -> createPreset());
        btnPresetClear.setOnClickListener(view -> bulkDeletePresets());
        btnCruiseStart.setOnClickListener(view -> startCruiseFromPresets());
        btnCruiseStop.setOnClickListener(view -> enqueueMapCall(api().cruiseStop(videoId), "cruise stop"));
        btnCruiseStatus.setOnClickListener(view -> enqueueMapCall(api().cruiseStatus(videoId), "cruise status"));
        tabPresets.setOnClickListener(view -> showControlPanel("presets"));
        tabPtz.setOnClickListener(view -> showControlPanel("ptz"));
        tabAi.setOnClickListener(view -> showControlPanel("ai"));
        showControlPanel("ptz");

        btnAiSaveRules.setOnClickListener(view -> saveDeviceAiRules());
        btnAiStart.setOnClickListener(view -> startSelectedAIMonitor());
        btnAiStop.setOnClickListener(view -> stopAIMonitor());
        loadAiRules();
    }

    private void showControlPanel(String panel) {
        boolean showPresets = "presets".equals(panel);
        boolean showPtz = "ptz".equals(panel);
        boolean showAi = "ai".equals(panel);

        panelPresets.setVisibility(showPresets ? View.VISIBLE : View.GONE);
        panelPtz.setVisibility(showPtz ? View.VISIBLE : View.GONE);
        panelAi.setVisibility(showAi ? View.VISIBLE : View.GONE);

        tabPresets.setSelected(showPresets);
        tabPtz.setSelected(showPtz);
        tabAi.setSelected(showAi);
        tabPresets.setAlpha(showPresets ? 1.0f : 0.65f);
        tabPtz.setAlpha(showPtz ? 1.0f : 0.65f);
        tabAi.setAlpha(showAi ? 1.0f : 0.65f);
    }

    private void openFullscreen() {
        if (safeTrim(currentPlayUrl).isEmpty()) {
            Toast.makeText(requireContext(), "直播地址未准备好，请先播放直播", Toast.LENGTH_SHORT).show();
            return;
        }

        openingFullscreen = true;
        shouldResumeAfterFullscreen = isEzvizMode
                ? isPlaying
                : player != null && player.isPlaying();

        Log.d(TAG, "Open fullscreen independent player with playUrl=" + currentPlayUrl
                + ", playType=" + currentPlayType
                + ", shouldResume=" + shouldResumeAfterFullscreen);

        if (isEzvizMode) {
            if (ezvizPlayerManager != null) {
                ezvizPlayerManager.pause();
            }
        } else if (player != null) {
            player.pause();
        }

        FullscreenVideoDialog dlg = FullscreenVideoDialog.newInstance(currentPlayUrl, currentPlayType);
        dlg.setOnFullscreenDismissListener(this::onFullscreenDismissed);
        dlg.show(getChildFragmentManager(), "fullscreen_video");
    }

    private void initPlayer() {
        if (player != null) return;
        player = new ExoPlayer.Builder(requireContext()).build();
        player.addListener(new Player.Listener() {
            @Override
            public void onPlayerError(@NonNull PlaybackException error) {
                if (openingFullscreen) {
                    Log.e(TAG, "Fullscreen player error: " + error.getMessage(), error);
                } else {
                    Log.e(TAG, "Small player error: " + error.getMessage(), error);
                }
            }
        });
        playerView.setPlayer(player);
    }

    private void prepareLiveStream() {
        if (!isDeviceIdValid()) return;
        if (liveStreamCall != null) return;

        showPlayerStatus("正在获取视频流");
        VideoApi videoApi = ApiClient.get(requireContext()).create(VideoApi.class);
        liveStreamCall = BuildConfig.USE_HLS_DEBUG_STREAM
                ? videoApi.getLiveStream(deviceId, "hls")
                : videoApi.getLiveStream(deviceId);
        Log.i(TAG, "live stream request: url=" + liveStreamCall.request().url()
                + ", videoId=" + deviceId
                + ", useHlsDebugStream=" + BuildConfig.USE_HLS_DEBUG_STREAM);

        liveStreamCall.enqueue(new Callback<LiveStreamInfo>() {
            @Override
            public void onResponse(Call<LiveStreamInfo> call, Response<LiveStreamInfo> response) {
                if (!isAdded()) return;
                liveStreamCall = null;
                if (!response.isSuccessful() || response.body() == null) {
                    String errorBody = readErrorBody(response);
                    Log.e(TAG, "getLiveStream failed, code=" + response.code()
                            + ", errorBody=" + errorBody
                            + ", requestUrl=" + call.request().url());
                    showPlayerStatus("Failed to get live stream");
                    Toast.makeText(requireContext(), "Failed to get live stream", Toast.LENGTH_SHORT).show();
                    return;
                }

                LiveStreamInfo streamInfo = response.body();
                Log.d(TAG, "Live stream response: streamUrl=" + streamInfo.getStreamUrl()
                        + ", playType=" + streamInfo.getPlayType()
                        + ", platform=" + streamInfo.getPlatform()
                        + ", deviceSerial=" + streamInfo.getDeviceSerial()
                        + ", channelNo=" + streamInfo.getChannelNo());
                String playUrl = streamInfo.getStreamUrl();
                if (playUrl == null || playUrl.trim().isEmpty()) {
                    Log.e(TAG, "Failed to get live stream: empty stream url. response=" + streamInfo);
                    showPlayerStatus("鑾峰彇鐩存挱鍦板潃澶辫触");
                    Toast.makeText(requireContext(), "获取直播地址失败：后端未返回有效播放地址", Toast.LENGTH_SHORT).show();
                    return;
                }

                String rawUrl = safeTrim(playUrl);
                String playType = safeTrim(streamInfo.getPlayType()).toLowerCase();
                String platform = safeTrim(streamInfo.getPlatform()).toLowerCase();
                Log.i(TAG, "live stream info: videoId=" + deviceId
                        + ", platform=" + platform
                        + ", playType=" + playType
                        + ", url=" + rawUrl
                        + ", deviceSerial=" + safeTrim(streamInfo.getDeviceSerial())
                        + ", channelNo=" + streamInfo.getChannelNo()
                        + ", hasAccessToken=" + !safeTrim(streamInfo.getAccessToken()).isEmpty());

                if (rawUrl.isEmpty()) {
                    showPlayerStatus("获取直播地址失败");
                    Toast.makeText(requireContext(), "获取直播地址失败", Toast.LENGTH_SHORT).show();
                    return;
                }

                if (!BuildConfig.USE_HLS_DEBUG_STREAM && streamInfo.isEzopen()) {
                    currentPlayUrl = rawUrl;
                    currentPlayType = streamInfo.getPlayType();
                    Log.d(TAG, "Live small player playUrl=" + currentPlayUrl);
                    startEzvizStream(streamInfo, rawUrl);
                    return;
                }

                String streamUrl = AppConfig.toAbsoluteUrl(requireContext(), rawUrl);
                Log.i(TAG, "live stream resolved: videoId=" + deviceId
                        + ", playType=" + playType
                        + ", rawUrl=" + rawUrl
                        + ", streamUrl=" + streamUrl);
                String lowerUrl = streamUrl.toLowerCase();
                if (lowerUrl.startsWith("rtsp://")) {
                    showPlayerStatus("当前播放器不支持 RTSP");
                    Toast.makeText(requireContext(), "RTSP cannot be played by the current app player", Toast.LENGTH_LONG).show();
                    return;
                }
                if (lowerUrl.endsWith(".flv") || "flv".equals(playType)) {
                    showPlayerStatus("当前播放器不支持 FLV");
                    Toast.makeText(requireContext(), "FLV live stream is not supported by the current app player", Toast.LENGTH_LONG).show();
                    return;
                }

                currentPlayUrl = streamUrl;
                currentPlayType = streamInfo.getPlayType();
                Log.d(TAG, "Live small player playUrl=" + currentPlayUrl);
                Log.d(TAG, "getLiveStream success, final playUrl=" + streamUrl);
                startExoStream(streamUrl);
            }

            @Override
            public void onFailure(Call<LiveStreamInfo> call, Throwable t) {
                if (!isAdded()) return;
                liveStreamCall = null;
                if (call.isCanceled()) return;
                Log.e(TAG, "getLiveStream failed, requestUrl=" + call.request().url(), t);
                showPlayerStatus("Failed to get live stream");
                Toast.makeText(requireContext(), "Failed to get live stream: " + safeMessage(t), Toast.LENGTH_SHORT).show();
            }
        });
    }

    private void startEzvizStream(LiveStreamInfo streamInfo, String rawUrl) {
        Log.i(TAG, "use EZVIZ native SDK branch for ezopen stream");
        currentPlayUrl = rawUrl;
        currentPlayType = streamInfo.getPlayType();
        isEzvizMode = true;
        releaseExoPlayer();
        playerView.setVisibility(View.GONE);
        ezvizPlayerContainer.setVisibility(View.VISIBLE);
        showPlayerStatus("正在连接萤石云视频");
        ezvizPlayerManager.start(
                rawUrl,
                streamInfo.getAccessToken(),
                streamInfo.getDeviceSerial(),
                streamInfo.getChannelNo()
        );
    }

    private void startExoStream(String streamUrl) {
        Log.i(TAG, "use ExoPlayer branch for streamUrl=" + streamUrl);
        if (safeTrim(streamUrl).toLowerCase().startsWith("ezopen://")) {
            Log.e(TAG, "Reject ezopen URL for ExoPlayer");
            showPlayerStatus("ExoPlayer cannot play ezopen stream");
            Toast.makeText(requireContext(), "ExoPlayer cannot play ezopen stream", Toast.LENGTH_LONG).show();
            return;
        }
        currentPlayUrl = streamUrl;
        isEzvizMode = false;
        if (ezvizPlayerManager != null) ezvizPlayerManager.stop();
        ezvizPlayerContainer.setVisibility(View.GONE);
        playerView.setVisibility(View.VISIBLE);
        hidePlayerStatus();
        initPlayer();
        player.setMediaItem(MediaItem.fromUri(Uri.parse(streamUrl)));
        player.prepare();
        player.play();
        streamPrepared = true;
        isPlaying = true;
        btnPlayPause.setImageResource(android.R.drawable.ic_media_pause);
    }

    private void togglePlayPause() {
        if (isEzvizMode) {
            if (ezvizPlayerManager == null) return;
            if (isPlaying) {
                ezvizPlayerManager.pause();
                btnPlayPause.setImageResource(android.R.drawable.ic_media_play);
                isPlaying = false;
            } else {
                showPlayerStatus("正在连接萤石云视频");
                ezvizPlayerManager.resume();
                btnPlayPause.setImageResource(android.R.drawable.ic_media_pause);
                isPlaying = true;
            }
            return;
        }

        if (player == null) return;

        if (isPlaying) {
            player.pause();
            btnPlayPause.setImageResource(android.R.drawable.ic_media_play);
        } else {
            player.play();
            btnPlayPause.setImageResource(android.R.drawable.ic_media_pause);
        }
        isPlaying = !isPlaying;
    }

    private void onFullscreenDismissed() {
        Log.d(TAG, "Fullscreen dismissed, resume small player, shouldResume=" + shouldResumeAfterFullscreen
                + ", playUrl=" + currentPlayUrl);
        openingFullscreen = false;
        if (!shouldResumeAfterFullscreen) return;

        if (isEzvizMode) {
            if (ezvizPlayerManager != null) {
                ezvizPlayerManager.resume();
                isPlaying = true;
                btnPlayPause.setImageResource(android.R.drawable.ic_media_pause);
            }
            return;
        }

        resumeSmallPlayerAfterFullscreen();
    }

    private void resumeSmallPlayerAfterFullscreen() {
        if (safeTrim(currentPlayUrl).isEmpty()) return;

        try {
            if (player == null) {
                startExoStream(currentPlayUrl);
                return;
            }

            player.setMediaItem(MediaItem.fromUri(Uri.parse(currentPlayUrl)));
            player.prepare();
            player.play();
            isPlaying = true;
            streamPrepared = true;
            btnPlayPause.setImageResource(android.R.drawable.ic_media_pause);
            Log.d(TAG, "Small player re-prepared after fullscreen");
        } catch (Exception e) {
            Log.e(TAG, "Failed to resume small player after fullscreen", e);
        }
    }

    private void bindContinuousControl(View control, String type, String direction) {
        if (control == null) return;
        control.setOnTouchListener((view, event) -> {
            int action = event.getActionMasked();
            if (action == MotionEvent.ACTION_DOWN) {
                view.setPressed(true);
                sendControlStart(type, direction);
                return true;
            }
            if (action == MotionEvent.ACTION_UP || action == MotionEvent.ACTION_CANCEL) {
                view.setPressed(false);
                sendControlStop(type, direction);
                return true;
            }
            return true;
        });
    }

    private void sendControlStart(String type, String direction) {
        if (!isDeviceIdValid()) return;
        Map<String, Object> body = new HashMap<>();
        body.put("device_id", videoId);
        body.put("direction", direction);
        body.put("speed", 0.5);
        body.put("duration", 1);
        VideoApi api = ApiClient.get(requireContext()).create(VideoApi.class);
        Call<Map<String, Object>> call = "zoom".equals(type)
                ? api.zoomStart(videoId, body)
                : api.ptzStart(videoId, body);
        Log.i(TAG, "control start request body: type=" + type + ", body=" + body);
        enqueueControlCall(call, type + " start " + direction);
    }

    private void sendControlStop(String type, String direction) {
        if (!isDeviceIdValid()) return;
        VideoApi api = ApiClient.get(requireContext()).create(VideoApi.class);
        Call<Map<String, Object>> call = "zoom".equals(type)
                ? api.zoomStop(videoId)
                : api.ptzStop(videoId);
        enqueueControlCall(call, type + " stop " + direction);
    }

    private void enqueueControlCall(Call<Map<String, Object>> call, String action) {
        Log.i(TAG, "control request: " + action
                + ", videoId=" + videoId
                + ", url=" + call.request().url());
        call.enqueue(new Callback<Map<String, Object>>() {
            @Override
            public void onResponse(Call<Map<String, Object>> call, Response<Map<String, Object>> response) {
                if (!isAdded()) return;
                if (response.isSuccessful()) {
                    Log.i(TAG, "control success: " + action);
                    Toast.makeText(requireContext(), action + " success", Toast.LENGTH_SHORT).show();
                } else {
                    Log.e(TAG, "control failed: " + action + ", code=" + response.code());
                    Toast.makeText(requireContext(), action + " failed: " + response.code(), Toast.LENGTH_SHORT).show();
                }
            }

            @Override
            public void onFailure(Call<Map<String, Object>> call, Throwable t) {
                if (!isAdded()) return;
                Log.e(TAG, "control error: " + action, t);
                Toast.makeText(requireContext(), action + " error: " + safeMessage(t), Toast.LENGTH_SHORT).show();
            }
        });
    }

    private VideoApi api() {
        return ApiClient.get(requireContext()).create(VideoApi.class);
    }

    private void fetchPresets(boolean showDialog) {
        if (!isDeviceIdValid()) return;
        Log.i(TAG, "Load preset list start, videoId=" + videoId);
        api().getPresets(videoId).enqueue(new Callback<List<Map<String, Object>>>() {
            @Override
            public void onResponse(Call<List<Map<String, Object>>> call, Response<List<Map<String, Object>>> response) {
                if (!isAdded()) return;
                if (!response.isSuccessful() || response.body() == null) {
                    Log.e(TAG, "Load preset list fail, code=" + response.code());
                    Toast.makeText(requireContext(), "preset list failed: " + response.code(), Toast.LENGTH_SHORT).show();
                    return;
                }
                presetCache.clear();
                presetCache.addAll(response.body());
                updatePresetListView();
                Log.i(TAG, "Load preset list success, size=" + presetCache.size());
                Toast.makeText(requireContext(), "presets: " + presetCache.size(), Toast.LENGTH_SHORT).show();
                if (showDialog) showPresetDialog();
            }

            @Override
            public void onFailure(Call<List<Map<String, Object>>> call, Throwable t) {
                if (!isAdded()) return;
                Log.e(TAG, "Load preset list fail", t);
                Toast.makeText(requireContext(), "preset list error: " + safeMessage(t), Toast.LENGTH_SHORT).show();
            }
        });
    }

    private void updatePresetListView() {
        if (presetAdapter != null) presetAdapter.notifyDataSetChanged();
        boolean isEmpty = presetCache.isEmpty();
        if (tvPresetsEmpty != null) tvPresetsEmpty.setVisibility(isEmpty ? View.VISIBLE : View.GONE);
        if (rvPresets != null) rvPresets.setVisibility(isEmpty ? View.GONE : View.VISIBLE);
    }

    private void showPresetDialog() {
        if (presetCache.isEmpty()) {
            Toast.makeText(requireContext(), "no presets", Toast.LENGTH_SHORT).show();
            return;
        }
        String[] labels = new String[presetCache.size()];
        for (int i = 0; i < presetCache.size(); i++) {
            Map<String, Object> item = presetCache.get(i);
            labels[i] = presetName(item) + " (" + presetToken(item) + ")";
        }
        new AlertDialog.Builder(requireContext())
                .setTitle("Presets")
                .setItems(labels, (dialog, which) -> showPresetActionDialog(presetCache.get(which)))
                .show();
    }

    private void showPresetActionDialog(Map<String, Object> preset) {
        String token = presetToken(preset);
        if (token.isEmpty()) {
            Toast.makeText(requireContext(), "preset token empty", Toast.LENGTH_SHORT).show();
            return;
        }
        new AlertDialog.Builder(requireContext())
                .setTitle(presetName(preset))
                .setItems(new String[]{"Goto", "Delete"}, (dialog, which) -> {
                    if (which == 0) {
                        Map<String, Object> body = new HashMap<>();
                        body.put("speed", 0.5);
                        enqueueMapCall(api().gotoPreset(videoId, token, body), "preset goto " + token);
                    } else {
                        enqueueMapCall(api().deletePreset(videoId, token), "preset delete " + token);
                    }
                })
                .show();
    }

    private void createPreset() {
        if (!isDeviceIdValid()) return;
        Log.i(TAG, "Add preset clicked");
        Map<String, Object> body = new HashMap<>();
        body.put("name", "AppPreset-" + System.currentTimeMillis());
        Log.i(TAG, "request: preset create, videoId=" + videoId);
        api().createPreset(videoId, body).enqueue(new Callback<Map<String, Object>>() {
            @Override
            public void onResponse(Call<Map<String, Object>> call, Response<Map<String, Object>> response) {
                if (!isAdded()) return;
                if (response.isSuccessful()) {
                    Log.i(TAG, "Add preset success, body=" + response.body());
                    Toast.makeText(requireContext(), "preset create success", Toast.LENGTH_SHORT).show();
                    fetchPresets(false);
                } else {
                    Log.e(TAG, "Add preset fail, code=" + response.code());
                    Toast.makeText(requireContext(), "preset create failed: " + response.code(), Toast.LENGTH_SHORT).show();
                }
            }

            @Override
            public void onFailure(Call<Map<String, Object>> call, Throwable t) {
                if (!isAdded()) return;
                Log.e(TAG, "Add preset fail", t);
                Toast.makeText(requireContext(), "preset create error: " + safeMessage(t), Toast.LENGTH_SHORT).show();
            }
        });
    }

    private void bulkDeletePresets() {
        if (!isDeviceIdValid()) return;
        if (presetCache.isEmpty()) {
            fetchPresets(false);
            Toast.makeText(requireContext(), "press Clear again after presets load", Toast.LENGTH_SHORT).show();
            return;
        }
        ArrayList<String> tokens = presetTokens();
        if (tokens.isEmpty()) {
            Toast.makeText(requireContext(), "no preset tokens", Toast.LENGTH_SHORT).show();
            return;
        }
        new AlertDialog.Builder(requireContext())
                .setTitle("Delete all presets?")
                .setMessage("count: " + tokens.size())
                .setPositiveButton("Delete", (dialog, which) -> {
                    Map<String, Object> body = new HashMap<>();
                    body.put("preset_tokens", tokens);
                    enqueueMapCall(api().bulkDeletePresets(videoId, body), "preset bulk-delete");
                })
                .setNegativeButton("Cancel", null)
                .show();
    }

    private void startCruiseFromPresets() {
        if (!isDeviceIdValid()) return;
        ArrayList<String> tokens = presetTokens();
        if (tokens.size() < 2) {
            Toast.makeText(requireContext(), "cruise needs at least 2 presets", Toast.LENGTH_SHORT).show();
            fetchPresets(false);
            return;
        }
        enqueueMapCall(api().cruiseStart(videoId, cruiseBody(tokens)), "cruise start");
    }

    private Map<String, Object> cruiseBody(ArrayList<String> tokens) {
        Map<String, Object> body = new HashMap<>();
        body.put("preset_tokens", tokens);
        body.put("dwell_seconds", 8.0);
        return body;
    }

    private ArrayList<String> presetTokens() {
        ArrayList<String> tokens = new ArrayList<>();
        for (Map<String, Object> item : presetCache) {
            String token = presetToken(item);
            if (!token.isEmpty()) tokens.add(token);
        }
        return tokens;
    }

    private String presetToken(Map<String, Object> item) {
        Object value = item == null ? null : item.get("token");
        return value == null ? "" : value.toString();
    }

    private String presetName(Map<String, Object> item) {
        Object value = item == null ? null : item.get("name");
        String name = value == null ? "" : value.toString();
        return name.trim().isEmpty() ? "Preset" : name;
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }

    private class PresetAdapter extends RecyclerView.Adapter<PresetAdapter.VH> {
        @NonNull
        @Override
        public VH onCreateViewHolder(@NonNull ViewGroup parent, int viewType) {
            TextView textView = new TextView(parent.getContext());
            textView.setLayoutParams(new RecyclerView.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT,
                    ViewGroup.LayoutParams.WRAP_CONTENT));
            textView.setMinHeight(dp(44));
            textView.setGravity(Gravity.CENTER_VERTICAL);
            textView.setPadding(dp(12), dp(6), dp(12), dp(6));
            textView.setTextColor(0xFF333333);
            textView.setTextSize(14);
            return new VH(textView);
        }

        @Override
        public void onBindViewHolder(@NonNull VH holder, int position) {
            Map<String, Object> preset = presetCache.get(position);
            String token = presetToken(preset);
            String label = presetName(preset);
            if (!token.isEmpty()) label += " (" + token + ")";
            holder.title.setText(label);
            holder.itemView.setOnClickListener(view -> showPresetActionDialog(preset));
        }

        @Override
        public int getItemCount() {
            return presetCache.size();
        }

        class VH extends RecyclerView.ViewHolder {
            final TextView title;

            VH(@NonNull View itemView) {
                super(itemView);
                title = (TextView) itemView;
            }
        }
    }

    private static class AiRuleOption {
        final String key;
        final String desc;

        AiRuleOption(String key, String desc) {
            this.key = key == null ? "" : key;
            this.desc = desc == null ? "" : desc;
        }
    }

    private void enqueueMapCall(Call<Map<String, Object>> call, String action) {
        if (!isDeviceIdValid()) return;
        Log.i(TAG, "request: " + action + ", videoId=" + videoId);
        call.enqueue(new Callback<Map<String, Object>>() {
            @Override
            public void onResponse(Call<Map<String, Object>> call, Response<Map<String, Object>> response) {
                if (!isAdded()) return;
                if (response.isSuccessful()) {
                    Log.i(TAG, "success: " + action + ", body=" + response.body());
                    Toast.makeText(requireContext(), action + " success", Toast.LENGTH_SHORT).show();
                    if (action.startsWith("preset")) fetchPresets(false);
                } else {
                    Log.e(TAG, "failed: " + action + ", code=" + response.code());
                    Toast.makeText(requireContext(), action + " failed: " + response.code(), Toast.LENGTH_SHORT).show();
                }
            }

            @Override
            public void onFailure(Call<Map<String, Object>> call, Throwable t) {
                if (!isAdded()) return;
                Log.e(TAG, "error: " + action, t);
                Toast.makeText(requireContext(), action + " error: " + safeMessage(t), Toast.LENGTH_SHORT).show();
            }
        });
    }

    private void loadAiRules() {
        if (aiRuleContainer == null) return;
        renderAiRules(defaultAiRules());
        setAiStatus("状态：正在加载AI规则...");
        api().getAIRules().enqueue(new Callback<Map<String, Object>>() {
            @Override
            public void onResponse(Call<Map<String, Object>> call, Response<Map<String, Object>> response) {
                if (!isAdded()) return;
                if (!response.isSuccessful() || response.body() == null) {
                    setAiStatus("状态：使用本地AI规则列表");
                    Toast.makeText(requireContext(), "AI规则加载失败，使用本地列表", Toast.LENGTH_SHORT).show();
                    loadDeviceAiRules();
                    return;
                }

                Object dataObj = response.body().get("data");
                if (!(dataObj instanceof List)) {
                    setAiStatus("状态：使用本地AI规则列表");
                    Toast.makeText(requireContext(), "AI规则数据格式异常，使用本地列表", Toast.LENGTH_SHORT).show();
                    loadDeviceAiRules();
                    return;
                }

                List<?> dataList = (List<?>) dataObj;
                ArrayList<AiRuleOption> rules = new ArrayList<>();
                for (Object itemObj : dataList) {
                    if (!(itemObj instanceof Map)) continue;
                    Map<?, ?> item = (Map<?, ?>) itemObj;
                    String key = safeObjectString(item.get("key"));
                    String desc = safeObjectString(item.get("desc"));
                    if (key.isEmpty()) continue;
                    if (desc.isEmpty()) desc = key;
                    rules.add(new AiRuleOption(key, desc));
                }

                if (!rules.isEmpty()) renderAiRules(rules);
                Log.i(TAG, "load ai rules success, count=" + aiRuleCheckBoxes.size());
                setAiStatus("状态：未启动");
                loadDeviceAiRules();
            }

            @Override
            public void onFailure(Call<Map<String, Object>> call, Throwable t) {
                if (!isAdded()) return;
                Log.e(TAG, "load ai rules error", t);
                setAiStatus("状态：使用本地AI规则列表");
                Toast.makeText(requireContext(), "AI规则加载错误，使用本地列表: " + safeMessage(t), Toast.LENGTH_SHORT).show();
                loadDeviceAiRules();
            }
        });
    }

    private ArrayList<AiRuleOption> defaultAiRules() {
        ArrayList<AiRuleOption> rules = new ArrayList<>();
        rules.add(new AiRuleOption("helmet", "安全帽检测"));
        rules.add(new AiRuleOption("smoking", "抽烟检测"));
        rules.add(new AiRuleOption("person_distance", "多人作业人员间距检测"));
        rules.add(new AiRuleOption("face_recognition", "人脸识别"));
        rules.add(new AiRuleOption("signage", "现场标识类"));
        rules.add(new AiRuleOption("behavior", "作业行为类"));
        rules.add(new AiRuleOption("supervisor_count", "现场监督人数统计"));
        rules.add(new AiRuleOption("ladder_angle", "梯子角度类"));
        rules.add(new AiRuleOption("hole_curb", "孔口挡坎违规类"));
        rules.add(new AiRuleOption("unauthorized_person", "围栏入侵管理类"));
        rules.add(new AiRuleOption("firefighting_equipment_v2", "动火消防器材V2"));
        return rules;
    }

    private void renderAiRules(List<AiRuleOption> rules) {
        if (aiRuleContainer == null) return;
        aiRuleContainer.removeAllViews();
        aiRuleCheckBoxes.clear();

        for (AiRuleOption rule : rules) {
            if (rule == null || rule.key.isEmpty()) continue;
            CheckBox cb = new CheckBox(requireContext());
            cb.setText(rule.desc.isEmpty() ? rule.key : rule.desc);
            cb.setTag(rule.key);
            cb.setTextSize(14);
            cb.setPadding(4, 4, 4, 4);
            aiRuleContainer.addView(cb);
            aiRuleCheckBoxes.put(rule.key, cb);
        }
    }

    private void loadDeviceAiRules() {
        if (!isDeviceIdValid()) return;
        api().getDeviceAIRules(videoId).enqueue(new Callback<Map<String, Object>>() {
            @Override
            public void onResponse(Call<Map<String, Object>> call, Response<Map<String, Object>> response) {
                if (!isAdded()) return;
                if (!response.isSuccessful() || response.body() == null) return;

                Object rulesObj = response.body().get("rules");
                if (!(rulesObj instanceof List)) return;

                for (CheckBox cb : aiRuleCheckBoxes.values()) {
                    cb.setChecked(false);
                }

                List<?> rules = (List<?>) rulesObj;
                for (Object keyObj : rules) {
                    String key = safeObjectString(keyObj);
                    CheckBox cb = aiRuleCheckBoxes.get(key);
                    if (cb != null) cb.setChecked(true);
                }
                Log.i(TAG, "load device ai rules success, count=" + rules.size());
            }

            @Override
            public void onFailure(Call<Map<String, Object>> call, Throwable t) {
                if (!isAdded()) return;
                Log.e(TAG, "load device ai rules error", t);
            }
        });
    }

    private ArrayList<String> collectSelectedAiRules() {
        ArrayList<String> rules = new ArrayList<>();
        for (Map.Entry<String, CheckBox> entry : aiRuleCheckBoxes.entrySet()) {
            if (entry.getValue().isChecked()) {
                rules.add(entry.getKey());
            }
        }
        return rules;
    }

    private void saveDeviceAiRules() {
        if (!isDeviceIdValid()) return;
        ArrayList<String> rules = collectSelectedAiRules();
        Map<String, Object> body = new HashMap<>();
        body.put("rules", rules);

        Log.i(TAG, "update device ai rules, rules=" + rules);
        api().updateDeviceAIRules(videoId, body).enqueue(new Callback<Map<String, Object>>() {
            @Override
            public void onResponse(Call<Map<String, Object>> call, Response<Map<String, Object>> response) {
                if (!isAdded()) return;
                if (response.isSuccessful()) {
                    setAiStatus("状态：AI配置已保存");
                    Toast.makeText(requireContext(), "AI配置已保存", Toast.LENGTH_SHORT).show();
                } else {
                    Toast.makeText(requireContext(), "AI配置保存失败: " + response.code(), Toast.LENGTH_SHORT).show();
                }
            }

            @Override
            public void onFailure(Call<Map<String, Object>> call, Throwable t) {
                if (!isAdded()) return;
                Log.e(TAG, "update device ai rules error", t);
                Toast.makeText(requireContext(), "AI配置保存错误: " + safeMessage(t), Toast.LENGTH_SHORT).show();
            }
        });
    }

    private void startSelectedAIMonitor() {
        if (!isDeviceIdValid()) return;
        ArrayList<String> rules = collectSelectedAiRules();
        if (rules.isEmpty()) {
            Toast.makeText(requireContext(), "请至少选择一个AI监测功能", Toast.LENGTH_SHORT).show();
            return;
        }

        String algoType = String.join(",", rules);
        Map<String, Object> body = new HashMap<>();
        body.put("device_id", deviceId);
        body.put("algo_type", algoType);

        Log.i(TAG, "start ai monitor algoType=" + algoType);
        setAiStatus("状态：正在启动AI监测...");
        api().startAIMonitor(body).enqueue(new Callback<Map<String, Object>>() {
            @Override
            public void onResponse(Call<Map<String, Object>> call, Response<Map<String, Object>> response) {
                if (!isAdded()) return;
                if (response.isSuccessful()) {
                    setAiStatus("状态：AI监测运行中 - " + algoType);
                    Toast.makeText(requireContext(), "AI监测已启动", Toast.LENGTH_SHORT).show();
                } else {
                    setAiStatus("状态：AI监测启动失败");
                    Toast.makeText(requireContext(), "AI启动失败: " + response.code(), Toast.LENGTH_SHORT).show();
                }
            }

            @Override
            public void onFailure(Call<Map<String, Object>> call, Throwable t) {
                if (!isAdded()) return;
                Log.e(TAG, "start ai monitor error", t);
                setAiStatus("状态：AI监测启动错误");
                Toast.makeText(requireContext(), "AI启动错误: " + safeMessage(t), Toast.LENGTH_SHORT).show();
            }
        });
    }

    private void stopAIMonitor() {
        if (!isDeviceIdValid()) return;
        Log.i(TAG, "stop ai monitor");
        setAiStatus("状态：正在停止AI监测...");
        api().stopAIMonitor(deviceId).enqueue(new Callback<Map<String, Object>>() {
            @Override
            public void onResponse(Call<Map<String, Object>> call, Response<Map<String, Object>> response) {
                if (!isAdded()) return;
                setAiStatus("状态：AI监测已停止");
                Toast.makeText(requireContext(), "AI监测已停止", Toast.LENGTH_SHORT).show();
            }

            @Override
            public void onFailure(Call<Map<String, Object>> call, Throwable t) {
                if (!isAdded()) return;
                Log.e(TAG, "stop ai monitor error", t);
                setAiStatus("状态：AI监测停止失败");
                Toast.makeText(requireContext(), "停止失败: " + safeMessage(t), Toast.LENGTH_SHORT).show();
            }
        });
    }

    private void connectAlarmWebSocket() {
        closeAlarmWebSocket();
        String wsUrl = toWsUrl(AppConfig.getBaseUrl(requireContext())) + "ws/alarm";
        Request request = new Request.Builder().url(wsUrl).build();
        alarmWebSocket = alarmSocketClient.newWebSocket(request, new WebSocketListener() {
            @Override
            public void onMessage(@NonNull WebSocket webSocket, @NonNull String text) {
                handleAlarmSocketMessage(text);
            }

            @Override
            public void onFailure(@NonNull WebSocket webSocket, @NonNull Throwable t, okhttp3.Response response) {
                Log.w(TAG, "alarm websocket failed: " + safeMessage(t));
            }
        });
    }

    private void closeAlarmWebSocket() {
        if (alarmWebSocket != null) {
            alarmWebSocket.close(1000, "closed");
            alarmWebSocket = null;
        }
        if (alarmOverlayView != null) {
            alarmOverlayView.clearBoxes();
        }
    }

    private void handleAlarmSocketMessage(String text) {
        try {
            JsonObject payload = JsonParser.parseString(text).getAsJsonObject();
            JsonObject alarm = payload.has("data") && payload.get("data").isJsonObject()
                    ? payload.getAsJsonObject("data")
                    : payload;
            if (!matchesCurrentDevice(alarm)) return;

            List<AlarmBoxOverlayView.AlarmBox> boxes = parseAlarmBoxes(alarm);
            if (boxes.isEmpty()) return;

            if (!isAdded()) return;
            requireActivity().runOnUiThread(() -> {
                if (alarmOverlayView == null) return;
                int[] videoSize = currentVideoSize();
                alarmOverlayView.showBoxes(boxes, 3000, videoSize[0], videoSize[1]);
            });
        } catch (Exception e) {
            Log.w(TAG, "failed to parse alarm websocket message", e);
        }
    }

    private boolean matchesCurrentDevice(JsonObject alarm) {
        String alarmDeviceId = firstString(alarm, "device_id", "deviceId", "video_id", "videoId", "camera_id", "cameraId");
        return !alarmDeviceId.isEmpty() && alarmDeviceId.equals(String.valueOf(deviceId));
    }

    private List<AlarmBoxOverlayView.AlarmBox> parseAlarmBoxes(JsonObject alarm) {
        List<AlarmBoxOverlayView.AlarmBox> result = new ArrayList<>();
        JsonArray boxes = firstArray(alarm, "alarm_boxes", "boxes");
        if (boxes == null) return result;

        for (JsonElement element : boxes) {
            if (!element.isJsonObject()) continue;
            JsonObject box = element.getAsJsonObject();
            float[] coords = parseCoords(box);
            if (coords == null) continue;
            String label = firstString(box, "msg", "type", "personName");
            result.add(new AlarmBoxOverlayView.AlarmBox(coords[0], coords[1], coords[2], coords[3], label));
        }
        return result;
    }

    private float[] parseCoords(JsonObject box) {
        JsonArray coords = firstArray(box, "coords", "bbox", "xyxy", "box");
        if (coords != null && coords.size() >= 4) {
            return new float[] {
                    coords.get(0).getAsFloat(),
                    coords.get(1).getAsFloat(),
                    coords.get(2).getAsFloat(),
                    coords.get(3).getAsFloat()
            };
        }

        float x1 = firstFloat(box, "x1", "left", "x");
        float y1 = firstFloat(box, "y1", "top", "y");
        float x2 = hasAny(box, "x2", "right") ? firstFloat(box, "x2", "right") : x1 + firstFloat(box, "w", "width");
        float y2 = hasAny(box, "y2", "bottom") ? firstFloat(box, "y2", "bottom") : y1 + firstFloat(box, "h", "height");
        if (x2 <= x1 || y2 <= y1) return null;
        return new float[] { x1, y1, x2, y2 };
    }

    private int[] currentVideoSize() {
        if (player == null) return new int[] {0, 0};
        VideoSize size = player.getVideoSize();
        return new int[] {size.width, size.height};
    }

    private JsonArray firstArray(JsonObject obj, String... keys) {
        for (String key : keys) {
            if (obj.has(key) && obj.get(key).isJsonArray()) {
                return obj.getAsJsonArray(key);
            }
        }
        return null;
    }

    private String firstString(JsonObject obj, String... keys) {
        for (String key : keys) {
            if (obj.has(key) && !obj.get(key).isJsonNull()) {
                String value = obj.get(key).getAsString();
                if (value != null && !value.trim().isEmpty()) return value.trim();
            }
        }
        return "";
    }

    private float firstFloat(JsonObject obj, String... keys) {
        for (String key : keys) {
            if (obj.has(key) && !obj.get(key).isJsonNull()) {
                try {
                    return obj.get(key).getAsFloat();
                } catch (Exception ignored) {
                }
            }
        }
        return 0f;
    }

    private boolean hasAny(JsonObject obj, String... keys) {
        for (String key : keys) {
            if (obj.has(key) && !obj.get(key).isJsonNull()) return true;
        }
        return false;
    }

    private String toWsUrl(String baseUrl) {
        String url = baseUrl == null ? "" : baseUrl.trim();
        if (url.startsWith("https://")) {
            url = "wss://" + url.substring("https://".length());
        } else if (url.startsWith("http://")) {
            url = "ws://" + url.substring("http://".length());
        }
        if (!url.endsWith("/")) url += "/";
        return url;
    }

    private String safeMessage(Throwable t) {
        return t == null || t.getMessage() == null ? "unknown" : t.getMessage();
    }

    private void setAiStatus(String text) {
        if (tvAiStatus != null) {
            tvAiStatus.setText(text);
        }
    }

    private String safeObjectString(Object value) {
        return value == null ? "" : value.toString().trim();
    }

    private String readErrorBody(Response<?> response) {
        try {
            if (response == null || response.errorBody() == null) return "";
            return response.errorBody().string();
        } catch (Exception e) {
            return "failed to read error body: " + safeMessage(e);
        }
    }

    private static String safeTrim(String value) {
        return value == null ? "" : value.trim();
    }

    private boolean isDeviceIdValid() {
        if (!invalidDeviceId && videoId > 0) return true;
        Toast.makeText(requireContext(), "设备 ID 无效，无法操作", Toast.LENGTH_SHORT).show();
        return false;
    }

    private void showPlayerStatus(String text) {
        if (tvPlayerStatus == null) return;
        tvPlayerStatus.setText(text);
        tvPlayerStatus.setVisibility(View.VISIBLE);
    }

    private void hidePlayerStatus() {
        if (tvPlayerStatus == null) return;
        tvPlayerStatus.setVisibility(View.GONE);
    }

    private void releaseExoPlayer() {
        if (player != null) {
            player.release();
            player = null;
        }
    }

    @Override
    public void onPause() {
        super.onPause();
        if (openingFullscreen) {
            Log.d(TAG, "Skip pause because opening fullscreen");
        }
    }

    @Override
    public void onResume() {
        super.onResume();
        if (openingFullscreen && shouldResumeAfterFullscreen && !isEzvizMode && player != null) {
            Log.d(TAG, "Keep small player paused while fullscreen is active");
        }
    }

    @Override
    public void onDestroyView() {
        super.onDestroyView();
        if (liveStreamCall != null) {
            liveStreamCall.cancel();
            liveStreamCall = null;
        }
        if (ezvizPlayerManager != null) {
            ezvizPlayerManager.release();
            ezvizPlayerManager = null;
        }
        closeAlarmWebSocket();
        releaseExoPlayer();
    }
}
