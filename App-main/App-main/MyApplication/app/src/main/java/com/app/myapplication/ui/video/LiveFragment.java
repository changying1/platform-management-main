package com.app.myapplication.ui.video;
import android.content.pm.ActivityInfo;
import android.os.Bundle;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.ImageButton;
import android.widget.Switch;
import android.widget.Toast;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.fragment.app.Fragment;

import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.ui.PlayerView;

import com.app.myapplication.R;
import com.app.myapplication.data.api.ApiClient;
import com.app.myapplication.data.api.VideoApi;

import java.util.HashMap;
import java.util.Map;

import retrofit2.Call;
import retrofit2.Callback;
import retrofit2.Response;

public class LiveFragment extends Fragment {

    private static final String ARG_DEVICE_ID = "device_id";

    public static LiveFragment newInstance(String deviceId) {
        Bundle b = new Bundle();
        b.putString(ARG_DEVICE_ID, deviceId);
        LiveFragment f = new LiveFragment();
        f.setArguments(b);
        return f;
    }

    private boolean isFullscreen = false;
    private PlayerView playerView;
    private ImageButton btnPlayPause, btnFullscreen;
    private ImageButton ptzUp, ptzDown, ptzLeft, ptzRight;
    private Switch swAIMonitor;

    private ExoPlayer player;
    private boolean isPlaying = false;
    private String deviceId;
    private int videoId = 1;
    private boolean aiRunning = false;

    @Override public View onCreateView(@NonNull LayoutInflater inflater, ViewGroup container, Bundle savedInstanceState) {
        return inflater.inflate(R.layout.fragment_live, container, false);
    }

    @Override public void onViewCreated(@NonNull View v, Bundle savedInstanceState) {
        playerView = v.findViewById(R.id.player_view);
        btnPlayPause = v.findViewById(R.id.btn_play_pause);
        btnFullscreen = v.findViewById(R.id.btn_fullscreen);
        swAIMonitor = v.findViewById(R.id.sw_ai_monitor);

        ptzUp = v.findViewById(R.id.ptz_up);
        ptzDown = v.findViewById(R.id.ptz_down);
        ptzLeft = v.findViewById(R.id.ptz_left);
        ptzRight = v.findViewById(R.id.ptz_right);

        deviceId = getArguments() != null ? getArguments().getString(ARG_DEVICE_ID) : "1";
        try {
            videoId = Integer.parseInt(deviceId);
        } catch (NumberFormatException e) {
            videoId = 1;
        }

        btnPlayPause.setOnClickListener(view -> {
            if (player == null) {
                initPlayer();
            }
            togglePlayPause();
        });

        btnFullscreen.setOnClickListener(view -> {
            FullscreenVideoDialog dlg = new FullscreenVideoDialog();
            dlg.attachPlayerView(playerView);
            dlg.show(getParentFragmentManager(), "fullscreen_video");
        });

        ptzUp.setOnClickListener(view -> sendPtz("UP"));
        ptzDown.setOnClickListener(view -> sendPtz("DOWN"));
        ptzLeft.setOnClickListener(view -> sendPtz("LEFT"));
        ptzRight.setOnClickListener(view -> sendPtz("RIGHT"));

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

    private void togglePlayPause() {
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

    private void sendPtz(String dir) {
        VideoApi api = ApiClient.get(requireContext()).create(VideoApi.class);
        Map<String, Object> body = new HashMap<>();
        body.put("direction", dir);
        body.put("speed", 0.5);
        body.put("duration", 0.5);

        api.ptzControl(videoId, body).enqueue(new Callback<Map<String, Object>>() {
            @Override
            public void onResponse(Call<Map<String, Object>> call, Response<Map<String, Object>> response) {
                if (response.isSuccessful()) {
                    Toast.makeText(requireContext(), "PTZ " + dir + " 成功", Toast.LENGTH_SHORT).show();
                } else {
                    Toast.makeText(requireContext(), "PTZ 控制失败", Toast.LENGTH_SHORT).show();
                }
            }

            @Override
            public void onFailure(Call<Map<String, Object>> call, Throwable t) {
                Toast.makeText(requireContext(), "网络错误: " + t.getMessage(), Toast.LENGTH_SHORT).show();
            }
        });
    }

    private void startAIMonitor() {
        VideoApi api = ApiClient.get(requireContext()).create(VideoApi.class);
        Map<String, Object> body = new HashMap<>();
        body.put("device_id", deviceId);
        body.put("algo_type", "helmet");

        api.startAIMonitor(body).enqueue(new Callback<Map<String, Object>>() {
            @Override
            public void onResponse(Call<Map<String, Object>> call, Response<Map<String, Object>> response) {
                if (response.isSuccessful()) {
                    aiRunning = true;
                    Toast.makeText(requireContext(), "AI 监控已启动", Toast.LENGTH_SHORT).show();
                } else {
                    aiRunning = false;
                    swAIMonitor.setChecked(false);
                    Toast.makeText(requireContext(), "AI 启动失败", Toast.LENGTH_SHORT).show();
                }
            }

            @Override
            public void onFailure(Call<Map<String, Object>> call, Throwable t) {
                aiRunning = false;
                swAIMonitor.setChecked(false);
                Toast.makeText(requireContext(), "网络错误", Toast.LENGTH_SHORT).show();
            }
        });
    }

    private void stopAIMonitor() {
        VideoApi api = ApiClient.get(requireContext()).create(VideoApi.class);
        api.stopAIMonitor(deviceId).enqueue(new Callback<Map<String, Object>>() {
            @Override
            public void onResponse(Call<Map<String, Object>> call, Response<Map<String, Object>> response) {
                aiRunning = false;
                Toast.makeText(requireContext(), "AI 监控已停止", Toast.LENGTH_SHORT).show();
            }

            @Override
            public void onFailure(Call<Map<String, Object>> call, Throwable t) {
                Toast.makeText(requireContext(), "停止失败", Toast.LENGTH_SHORT).show();
            }
        });
    }

    @Override public void onDestroyView() {
        super.onDestroyView();
        if (player != null) {
            player.release();
            player = null;
        }
    }
}
