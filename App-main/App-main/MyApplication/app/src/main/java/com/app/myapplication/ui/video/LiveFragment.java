package com.app.myapplication.ui.video;

import android.net.Uri;
import android.os.Bundle;
import android.util.Log;
import android.view.LayoutInflater;
import android.view.MotionEvent;
import android.view.View;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.ImageButton;
import android.widget.Switch;
import android.widget.TextView;
import android.widget.Toast;

import androidx.appcompat.app.AlertDialog;
import androidx.annotation.NonNull;
import androidx.fragment.app.Fragment;
import androidx.media3.common.MediaItem;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.ui.PlayerView;

import com.app.myapplication.BuildConfig;
import com.app.myapplication.R;
import com.app.myapplication.data.api.ApiClient;
import com.app.myapplication.data.api.VideoApi;
import com.app.myapplication.data.local.AppConfig;
import com.app.myapplication.data.model.LiveStreamInfo;
import com.app.myapplication.ui.video.ezviz.EzvizPlayerManager;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

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
    private Button btnCruiseSave;
    private Button btnCruiseLoad;
    private Button btnCruiseStartCurrent;
    private Switch swAIMonitor;

    private ExoPlayer player;
    private EzvizPlayerManager ezvizPlayerManager;
    private Call<LiveStreamInfo> liveStreamCall;
    private boolean isPlaying = false;
    private boolean streamPrepared = false;
    private boolean isEzvizMode = false;
    private String deviceId;
    private int videoId = -1;
    private boolean invalidDeviceId = false;
    private final List<Map<String, Object>> presetCache = new ArrayList<>();

    @Override
    public View onCreateView(@NonNull LayoutInflater inflater, ViewGroup container, Bundle savedInstanceState) {
        return inflater.inflate(R.layout.fragment_live, container, false);
    }

    @Override
    public void onViewCreated(@NonNull View v, Bundle savedInstanceState) {
        playerView = v.findViewById(R.id.player_view);
        ezvizPlayerContainer = v.findViewById(R.id.ezviz_player_container);
        tvPlayerStatus = v.findViewById(R.id.tv_player_status);
        btnPlayPause = v.findViewById(R.id.btn_play_pause);
        btnFullscreen = v.findViewById(R.id.btn_fullscreen);
        swAIMonitor = v.findViewById(R.id.sw_ai_monitor);

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
        btnCruiseSave = v.findViewById(R.id.btn_cruise_save);
        btnCruiseLoad = v.findViewById(R.id.btn_cruise_load);
        btnCruiseStartCurrent = v.findViewById(R.id.btn_cruise_start_current);

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

        btnPlayPause.setOnClickListener(view -> {
            if (!streamPrepared) {
                prepareLiveStream();
            } else {
                togglePlayPause();
            }
        });

        btnFullscreen.setOnClickListener(view -> {
            FullscreenVideoDialog dlg = new FullscreenVideoDialog();
            dlg.attachPlayerView(isEzvizMode ? ezvizPlayerContainer : playerView);
            dlg.show(getParentFragmentManager(), "fullscreen_video");
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
        btnCruiseSave.setOnClickListener(view -> saveCurrentCruise());
        btnCruiseLoad.setOnClickListener(view -> enqueueMapCall(api().cruiseGetCurrent(videoId), "cruise current"));
        btnCruiseStartCurrent.setOnClickListener(view -> enqueueMapCall(api().cruiseStartCurrent(videoId), "cruise start current"));

        swAIMonitor.setOnCheckedChangeListener((btn, checked) -> {
            if (checked) {
                startAIMonitor();
            } else {
                stopAIMonitor();
            }
        });
    }

    private void initPlayer() {
        if (player != null) return;
        player = new ExoPlayer.Builder(requireContext()).build();
        playerView.setPlayer(player);
    }

    private void prepareLiveStream() {
        if (!isDeviceIdValid()) return;
        if (liveStreamCall != null) return;

        showPlayerStatus("正在获取视频流");
        VideoApi videoApi = ApiClient.get(requireContext()).create(VideoApi.class);
        liveStreamCall = BuildConfig.DEBUG
                ? videoApi.getLiveStream(deviceId, "hls")
                : videoApi.getLiveStream(deviceId);

        liveStreamCall.enqueue(new Callback<LiveStreamInfo>() {
            @Override
            public void onResponse(Call<LiveStreamInfo> call, Response<LiveStreamInfo> response) {
                if (!isAdded()) return;
                liveStreamCall = null;
                if (!response.isSuccessful() || response.body() == null) {
                    showPlayerStatus("获取直播地址失败");
                    Toast.makeText(requireContext(), "获取直播地址失败", Toast.LENGTH_SHORT).show();
                    return;
                }

                LiveStreamInfo streamInfo = response.body();
                String rawUrl = safeTrim(streamInfo.getUrl());
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

                if (streamInfo.isEzopen()) {
                    startEzvizStream(streamInfo, rawUrl);
                    return;
                }

                String streamUrl = AppConfig.toAbsoluteUrl(requireContext(), rawUrl);
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

                startExoStream(streamUrl);
            }

            @Override
            public void onFailure(Call<LiveStreamInfo> call, Throwable t) {
                if (!isAdded()) return;
                liveStreamCall = null;
                if (call.isCanceled()) return;
                showPlayerStatus("获取直播地址失败");
                Toast.makeText(requireContext(), "获取直播地址失败: " + safeMessage(t), Toast.LENGTH_SHORT).show();
            }
        });
    }

    private void startEzvizStream(LiveStreamInfo streamInfo, String rawUrl) {
        Log.i(TAG, "use EZVIZ native SDK branch for ezopen stream");
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
        body.put("direction", direction);
        body.put("speed", 0.5);
        VideoApi api = ApiClient.get(requireContext()).create(VideoApi.class);
        Call<Map<String, Object>> call = "zoom".equals(type)
                ? api.zoomStart(videoId, body)
                : api.ptzStart(videoId, body);
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
        Log.i(TAG, "control request: " + action + ", videoId=" + videoId);
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
        Log.i(TAG, "preset request: list, videoId=" + videoId);
        api().getPresets(videoId).enqueue(new Callback<List<Map<String, Object>>>() {
            @Override
            public void onResponse(Call<List<Map<String, Object>>> call, Response<List<Map<String, Object>>> response) {
                if (!isAdded()) return;
                if (!response.isSuccessful() || response.body() == null) {
                    Log.e(TAG, "preset list failed, code=" + response.code());
                    Toast.makeText(requireContext(), "preset list failed: " + response.code(), Toast.LENGTH_SHORT).show();
                    return;
                }
                presetCache.clear();
                presetCache.addAll(response.body());
                Log.i(TAG, "preset list success, count=" + presetCache.size());
                Toast.makeText(requireContext(), "presets: " + presetCache.size(), Toast.LENGTH_SHORT).show();
                if (showDialog) showPresetDialog();
            }

            @Override
            public void onFailure(Call<List<Map<String, Object>>> call, Throwable t) {
                if (!isAdded()) return;
                Log.e(TAG, "preset list error", t);
                Toast.makeText(requireContext(), "preset list error: " + safeMessage(t), Toast.LENGTH_SHORT).show();
            }
        });
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
        Map<String, Object> body = new HashMap<>();
        body.put("name", "AppPreset-" + System.currentTimeMillis());
        enqueueMapCall(api().createPreset(videoId, body), "preset create");
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

    private void saveCurrentCruise() {
        if (!isDeviceIdValid()) return;
        ArrayList<String> tokens = presetTokens();
        if (tokens.size() < 2) {
            Toast.makeText(requireContext(), "save needs at least 2 presets", Toast.LENGTH_SHORT).show();
            fetchPresets(false);
            return;
        }
        enqueueMapCall(api().cruiseSaveCurrent(videoId, cruiseBody(tokens)), "cruise save current");
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

    private void startAIMonitor() {
        if (!isDeviceIdValid()) {
            swAIMonitor.setChecked(false);
            return;
        }
        Map<String, Object> body = new HashMap<>();
        body.put("device_id", deviceId);
        body.put("algo_type", "helmet");

        ApiClient.get(requireContext()).create(VideoApi.class)
                .startAIMonitor(body)
                .enqueue(new Callback<Map<String, Object>>() {
                    @Override
                    public void onResponse(Call<Map<String, Object>> call, Response<Map<String, Object>> response) {
                        if (!isAdded()) return;
                        if (response.isSuccessful()) {
                            Toast.makeText(requireContext(), "AI monitor started", Toast.LENGTH_SHORT).show();
                        } else {
                            swAIMonitor.setChecked(false);
                            Toast.makeText(requireContext(), "AI start failed", Toast.LENGTH_SHORT).show();
                        }
                    }

                    @Override
                    public void onFailure(Call<Map<String, Object>> call, Throwable t) {
                        if (!isAdded()) return;
                        swAIMonitor.setChecked(false);
                        Toast.makeText(requireContext(), "Network error", Toast.LENGTH_SHORT).show();
                    }
                });
    }

    private void stopAIMonitor() {
        if (!isDeviceIdValid()) return;
        ApiClient.get(requireContext()).create(VideoApi.class)
                .stopAIMonitor(deviceId)
                .enqueue(new Callback<Map<String, Object>>() {
                    @Override
                    public void onResponse(Call<Map<String, Object>> call, Response<Map<String, Object>> response) {
                        if (!isAdded()) return;
                        Toast.makeText(requireContext(), "AI monitor stopped", Toast.LENGTH_SHORT).show();
                    }

                    @Override
                    public void onFailure(Call<Map<String, Object>> call, Throwable t) {
                        if (!isAdded()) return;
                        Toast.makeText(requireContext(), "Stop failed", Toast.LENGTH_SHORT).show();
                    }
                });
    }

    private String safeMessage(Throwable t) {
        return t == null || t.getMessage() == null ? "unknown" : t.getMessage();
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
        releaseExoPlayer();
    }
}
