package com.app.myapplication.ui.call;

import android.Manifest;
import android.content.pm.PackageManager;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.View;
import android.widget.ImageButton;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;

import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.annotation.NonNull;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.content.ContextCompat;
import androidx.recyclerview.widget.GridLayoutManager;
import androidx.recyclerview.widget.RecyclerView;

import com.app.myapplication.R;
import com.app.myapplication.data.api.ApiClient;
import com.app.myapplication.data.api.AppVoiceCallApi;
import com.app.myapplication.data.model.call.AgoraJoinInfo;
import com.app.myapplication.data.model.call.AppVoiceMuteRequest;
import com.app.myapplication.data.model.call.AppVoiceRoom;
import com.app.myapplication.data.model.call.AppVoiceRoomActionRequest;
import com.app.myapplication.ui.call.rtc.AgoraRtcManager;

import java.util.Locale;

import retrofit2.Call;
import retrofit2.Callback;
import retrofit2.Response;

public class VoiceRoomActivity extends AppCompatActivity {
    public static final String EXTRA_ROOM_ID = "room_id";
    public static final String EXTRA_USER_ID = "user_id";
    public static final String EXTRA_IS_INITIATOR = "is_initiator";

    private TextView tvTitle;
    private TextView tvStatus;
    private TextView tvDuration;
    private TextView tvMemberCount;
    private LinearLayout btnMute;
    private LinearLayout btnSpeaker;
    private LinearLayout btnRefresh;
    private LinearLayout btnHangup;
    private TextView tvMute;
    private TextView tvSpeaker;
    private RecyclerView rvMembers;

    private String roomId;
    private String userId;
    private boolean isInitiator;
    private boolean muted = false;
    private boolean speakerOn = true;
    private boolean leaving = false;
    private int durationSeconds = 0;
    private ActivityResultLauncher<String> audioPermissionLauncher;

    private final Handler handler = new Handler(Looper.getMainLooper());
    private final VoiceRoomMemberAdapter memberAdapter = new VoiceRoomMemberAdapter();
    private final AgoraRtcManager rtcManager = new AgoraRtcManager();

    private final Runnable timerRunnable = new Runnable() {
        @Override
        public void run() {
            durationSeconds++;
            updateDuration();
            handler.postDelayed(this, 1000);
        }
    };

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_voice_room);

        audioPermissionLauncher = registerForActivityResult(
                new ActivityResultContracts.RequestPermission(),
                granted -> {
                    if (granted) {
                        joinRoom();
                    } else {
                        Toast.makeText(this, "需要麦克风权限才能加入语音通话", Toast.LENGTH_SHORT).show();
                        finish();
                    }
                }
        );

        roomId = getIntent().getStringExtra(EXTRA_ROOM_ID);
        userId = getIntent().getStringExtra(EXTRA_USER_ID);
        isInitiator = getIntent().getBooleanExtra(EXTRA_IS_INITIATOR, false);

        initViews();
        initRtc();

        if (ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO)
                != PackageManager.PERMISSION_GRANTED) {
            audioPermissionLauncher.launch(Manifest.permission.RECORD_AUDIO);
            return;
        }

        joinRoom();
    }

    private void initViews() {
        tvTitle = findViewById(R.id.tv_title);
        tvStatus = findViewById(R.id.tv_status);
        tvDuration = findViewById(R.id.tv_duration);
        tvMemberCount = findViewById(R.id.tv_member_count);
        btnMute = findViewById(R.id.btn_mute);
        btnSpeaker = findViewById(R.id.btn_speaker);
        btnRefresh = findViewById(R.id.btn_refresh);
        btnHangup = findViewById(R.id.btn_hangup);
        tvMute = findViewById(R.id.tv_mute);
        tvSpeaker = findViewById(R.id.tv_speaker);
        rvMembers = findViewById(R.id.rv_members);
        ImageButton back = findViewById(R.id.iv_back);

        tvTitle.setText("语音房间");
        tvStatus.setText("正在连接...");
        rvMembers.setLayoutManager(new GridLayoutManager(this, 3));
        rvMembers.setAdapter(memberAdapter);

        back.setOnClickListener(v -> finishCall());
        btnHangup.setOnClickListener(v -> finishCall());
        btnRefresh.setOnClickListener(v -> refreshRoom());
        btnMute.setOnClickListener(v -> toggleMute());
        btnSpeaker.setOnClickListener(v -> toggleSpeaker());
    }

    private void initRtc() {
        rtcManager.setListener(new AgoraRtcManager.Listener() {
            @Override
            public void onJoinSuccess(String channel, int uid) {
                runOnUiThread(() -> {
                    tvStatus.setText("通话中");
                    handler.removeCallbacks(timerRunnable);
                    handler.post(timerRunnable);
                });
            }

            @Override
            public void onUserJoined(int uid) {
                runOnUiThread(() -> {
                    tvStatus.setText("成员已加入");
                    refreshRoom();
                });
            }

            @Override
            public void onUserOffline(int uid) {
                runOnUiThread(() -> {
                    tvStatus.setText("成员已离开");
                    refreshRoom();
                });
            }

            @Override
            public void onError(String message) {
                runOnUiThread(() -> Toast.makeText(VoiceRoomActivity.this, message, Toast.LENGTH_SHORT).show());
            }
        });
    }

    private void joinRoom() {
        if (roomId == null || userId == null) {
            Toast.makeText(this, "房间信息不完整", Toast.LENGTH_SHORT).show();
            finish();
            return;
        }

        AppVoiceCallApi api = ApiClient.get(this).create(AppVoiceCallApi.class);
        api.joinRoom(roomId, new AppVoiceRoomActionRequest(userId)).enqueue(new Callback<AgoraJoinInfo>() {
            @Override
            public void onResponse(@NonNull Call<AgoraJoinInfo> call, @NonNull Response<AgoraJoinInfo> response) {
                if (!response.isSuccessful() || response.body() == null) {
                    tvStatus.setText("加入失败");
                    Toast.makeText(VoiceRoomActivity.this, "加入语音房间失败", Toast.LENGTH_SHORT).show();
                    return;
                }
                AgoraJoinInfo info = response.body();
                bindRoom(info.room);
                try {
                    rtcManager.join(VoiceRoomActivity.this, info.appId, info.token, info.channelName, info.uid);
                    rtcManager.enableSpeaker(speakerOn);
                    rtcManager.muteLocalAudio(muted);
                } catch (Exception e) {
                    tvStatus.setText("Agora 初始化失败");
                    Toast.makeText(VoiceRoomActivity.this, e.getMessage(), Toast.LENGTH_LONG).show();
                }
            }

            @Override
            public void onFailure(@NonNull Call<AgoraJoinInfo> call, @NonNull Throwable t) {
                tvStatus.setText("网络异常");
                Toast.makeText(VoiceRoomActivity.this, "网络错误: " + t.getMessage(), Toast.LENGTH_SHORT).show();
            }
        });
    }

    private void refreshRoom() {
        AppVoiceCallApi api = ApiClient.get(this).create(AppVoiceCallApi.class);
        api.getRoom(roomId).enqueue(new Callback<AppVoiceRoom>() {
            @Override
            public void onResponse(@NonNull Call<AppVoiceRoom> call, @NonNull Response<AppVoiceRoom> response) {
                if (response.isSuccessful() && response.body() != null) {
                    bindRoom(response.body());
                }
            }

            @Override
            public void onFailure(@NonNull Call<AppVoiceRoom> call, @NonNull Throwable t) {
                Toast.makeText(VoiceRoomActivity.this, "刷新失败", Toast.LENGTH_SHORT).show();
            }
        });
    }

    private void bindRoom(AppVoiceRoom room) {
        if (room == null) {
            return;
        }
        tvTitle.setText(room.title == null ? "语音房间" : room.title);
        tvStatus.setText(statusText(room.status));
        int count = room.members == null ? 0 : room.members.size();
        tvMemberCount.setText(String.format(Locale.getDefault(), "%d 位成员", count));
        memberAdapter.setMembers(room.members);
    }

    private String statusText(String status) {
        if ("calling".equals(status)) {
            return "呼叫中";
        }
        if ("active".equals(status)) {
            return "通话中";
        }
        if ("ended".equals(status)) {
            return "已结束";
        }
        if ("cancelled".equals(status)) {
            return "已取消";
        }
        return "连接中";
    }

    private void toggleMute() {
        muted = !muted;
        rtcManager.muteLocalAudio(muted);
        tvMute.setText(muted ? "取消静音" : "静音");
        btnMute.setSelected(muted);
        AppVoiceCallApi api = ApiClient.get(this).create(AppVoiceCallApi.class);
        api.updateMute(roomId, new AppVoiceMuteRequest(userId, muted)).enqueue(new Callback<AppVoiceRoom>() {
            @Override
            public void onResponse(@NonNull Call<AppVoiceRoom> call, @NonNull Response<AppVoiceRoom> response) {
                if (response.isSuccessful() && response.body() != null) {
                    bindRoom(response.body());
                }
            }

            @Override
            public void onFailure(@NonNull Call<AppVoiceRoom> call, @NonNull Throwable t) {
                Toast.makeText(VoiceRoomActivity.this, "静音状态同步失败", Toast.LENGTH_SHORT).show();
            }
        });
    }

    private void toggleSpeaker() {
        speakerOn = !speakerOn;
        rtcManager.enableSpeaker(speakerOn);
        tvSpeaker.setText(speakerOn ? "扬声器" : "听筒");
        btnSpeaker.setSelected(speakerOn);
    }

    private void finishCall() {
        if (leaving) {
            return;
        }
        leaving = true;
        handler.removeCallbacks(timerRunnable);
        rtcManager.leave();

        AppVoiceCallApi api = ApiClient.get(this).create(AppVoiceCallApi.class);
        Call<AppVoiceRoom> call = isInitiator
                ? api.cancelRoom(roomId, new AppVoiceRoomActionRequest(userId))
                : api.leaveRoom(roomId, new AppVoiceRoomActionRequest(userId));
        call.enqueue(new Callback<AppVoiceRoom>() {
            @Override
            public void onResponse(@NonNull Call<AppVoiceRoom> call, @NonNull Response<AppVoiceRoom> response) {
                finish();
            }

            @Override
            public void onFailure(@NonNull Call<AppVoiceRoom> call, @NonNull Throwable t) {
                finish();
            }
        });
    }

    private void updateDuration() {
        int minutes = durationSeconds / 60;
        int seconds = durationSeconds % 60;
        tvDuration.setText(String.format(Locale.getDefault(), "%02d:%02d", minutes, seconds));
    }

    @Override
    public void onBackPressed() {
        finishCall();
    }

    @Override
    protected void onDestroy() {
        handler.removeCallbacks(timerRunnable);
        rtcManager.destroy();
        super.onDestroy();
    }
}
