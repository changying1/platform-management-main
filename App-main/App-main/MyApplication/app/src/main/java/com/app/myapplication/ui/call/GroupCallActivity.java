 package com.app.myapplication.ui.call;

import android.app.AlertDialog;
import android.content.Intent;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.text.TextUtils;
import android.widget.ImageButton;
import android.widget.TextView;
import android.widget.Toast;

import androidx.annotation.NonNull;
import androidx.appcompat.app.AppCompatActivity;
import androidx.fragment.app.Fragment;
import androidx.viewpager2.adapter.FragmentStateAdapter;
import androidx.viewpager2.widget.ViewPager2;

import com.app.myapplication.R;
import com.app.myapplication.data.api.ApiClient;
import com.app.myapplication.data.api.AppVoiceCallApi;
import com.app.myapplication.data.local.SessionManager;
import com.app.myapplication.data.model.call.AppVoiceMember;
import com.app.myapplication.data.model.call.AppVoiceRoom;
import com.app.myapplication.data.model.call.AppVoiceRoomActionRequest;
import com.google.android.material.tabs.TabLayout;
import com.google.android.material.tabs.TabLayoutMediator;

import java.util.HashSet;
import java.util.Set;

import retrofit2.Call;
import retrofit2.Callback;
import retrofit2.Response;

public class GroupCallActivity extends AppCompatActivity {
    private final AppVoiceCallSocket callSocket = new AppVoiceCallSocket();
    private final Set<String> showingRooms = new HashSet<>();
    private final Set<String> handledRooms = new HashSet<>();
    private final Handler handler = new Handler(Looper.getMainLooper());
    private boolean pollingInvites = false;
    private final Runnable invitePollRunnable = new Runnable() {
        @Override
        public void run() {
            pollIncomingRooms();
            if (pollingInvites) {
                handler.postDelayed(this, 3000);
            }
        }
    };

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_group_call_with_tabs);

        ImageButton back = findViewById(R.id.iv_back);
        TextView title = findViewById(R.id.tv_title);
        TabLayout tabLayout = findViewById(R.id.tab_layout);
        ViewPager2 viewPager = findViewById(R.id.view_pager);

        title.setText("语音通话");
        back.setOnClickListener(v -> finish());

        viewPager.setAdapter(new FragmentStateAdapter(this) {
            @NonNull
            @Override
            public Fragment createFragment(int position) {
                if (position == 1) {
                    return CallRecordsFragment.newInstance();
                }
                return VoiceCallFragment.newInstance();
            }

            @Override
            public int getItemCount() {
                return 2;
            }
        });

        new TabLayoutMediator(tabLayout, viewPager, (tab, position) ->
                tab.setText(position == 0 ? "发起通话" : "通话记录")
        ).attach();
    }

    @Override
    protected void onResume() {
        super.onResume();
        reconnectCallSocket();
        startInvitePolling();
    }

    @Override
    protected void onPause() {
        stopInvitePolling();
        super.onPause();
    }

    @Override
    protected void onDestroy() {
        stopInvitePolling();
        callSocket.close();
        super.onDestroy();
    }

    public void reconnectCallSocket() {
        String userId = new SessionManager(this).getUserId();
        callSocket.connect(this, userId, new AppVoiceCallSocket.Listener() {
            @Override
            public void onInvite(AppVoiceRoom room) {
                runOnUiThread(() -> showInviteDialog(room));
            }

            @Override
            public void onDisconnected() {
            }
        });
    }

    private void showInviteDialog(AppVoiceRoom room) {
        if (room == null || TextUtils.isEmpty(room.roomId) || isFinishing()) {
            return;
        }
        if (showingRooms.contains(room.roomId) || handledRooms.contains(room.roomId)) {
            return;
        }
        String userId = new SessionManager(this).getUserId();
        if (!isIncomingForCurrentUser(room, userId)) {
            return;
        }
        showingRooms.add(room.roomId);

        String title = TextUtils.isEmpty(room.title) ? "群组语音通话" : room.title;
        new AlertDialog.Builder(this)
                .setTitle("收到语音通话邀请")
                .setMessage(title)
                .setPositiveButton("接听", (dialog, which) -> {
                    showingRooms.remove(room.roomId);
                    handledRooms.add(room.roomId);
                    openRoom(room);
                })
                .setNegativeButton("拒绝", (dialog, which) -> {
                    showingRooms.remove(room.roomId);
                    handledRooms.add(room.roomId);
                    rejectRoom(room);
                })
                .setOnCancelListener(dialog -> showingRooms.remove(room.roomId))
                .show();
    }

    private void startInvitePolling() {
        if (pollingInvites) {
            return;
        }
        pollingInvites = true;
        handler.post(invitePollRunnable);
    }

    private void stopInvitePolling() {
        pollingInvites = false;
        handler.removeCallbacks(invitePollRunnable);
    }

    private void pollIncomingRooms() {
        String userId = new SessionManager(this).getUserId();
        if (TextUtils.isEmpty(userId)) {
            return;
        }
        AppVoiceCallApi api = ApiClient.get(this).create(AppVoiceCallApi.class);
        api.getRooms(userId, null, 20).enqueue(new Callback<java.util.List<AppVoiceRoom>>() {
            @Override
            public void onResponse(@NonNull Call<java.util.List<AppVoiceRoom>> call, @NonNull Response<java.util.List<AppVoiceRoom>> response) {
                if (!response.isSuccessful() || response.body() == null) {
                    return;
                }
                for (AppVoiceRoom room : response.body()) {
                    if (isIncomingForCurrentUser(room, userId)) {
                        showInviteDialog(room);
                        break;
                    }
                }
            }

            @Override
            public void onFailure(@NonNull Call<java.util.List<AppVoiceRoom>> call, @NonNull Throwable t) {
            }
        });
    }

    private boolean isIncomingForCurrentUser(AppVoiceRoom room, String userId) {
        if (room == null || TextUtils.isEmpty(userId) || TextUtils.equals(room.initiatorId, userId)) {
            return false;
        }
        if (!"calling".equals(room.status) && !"active".equals(room.status)) {
            return false;
        }
        if (room.members == null) {
            return false;
        }
        for (AppVoiceMember member : room.members) {
            if (TextUtils.equals(member.userId, userId) && "ringing".equals(member.status)) {
                return true;
            }
        }
        return false;
    }

    private void openRoom(AppVoiceRoom room) {
        String userId = new SessionManager(this).getUserId();
        if (TextUtils.isEmpty(userId)) {
            Toast.makeText(this, "请先选择当前身份", Toast.LENGTH_SHORT).show();
            return;
        }
        Intent intent = new Intent(this, VoiceRoomActivity.class);
        intent.putExtra(VoiceRoomActivity.EXTRA_ROOM_ID, room.roomId);
        intent.putExtra(VoiceRoomActivity.EXTRA_USER_ID, userId);
        intent.putExtra(VoiceRoomActivity.EXTRA_IS_INITIATOR, false);
        startActivity(intent);
    }

    private void rejectRoom(AppVoiceRoom room) {
        String userId = new SessionManager(this).getUserId();
        if (TextUtils.isEmpty(userId)) {
            return;
        }
        AppVoiceCallApi api = ApiClient.get(this).create(AppVoiceCallApi.class);
        api.rejectRoom(room.roomId, new AppVoiceRoomActionRequest(userId)).enqueue(new Callback<AppVoiceRoom>() {
            @Override
            public void onResponse(@NonNull Call<AppVoiceRoom> call, @NonNull Response<AppVoiceRoom> response) {
                Toast.makeText(GroupCallActivity.this, "已拒绝", Toast.LENGTH_SHORT).show();
            }

            @Override
            public void onFailure(@NonNull Call<AppVoiceRoom> call, @NonNull Throwable t) {
                Toast.makeText(GroupCallActivity.this, "拒绝失败: " + t.getMessage(), Toast.LENGTH_SHORT).show();
            }
        });
    }
}
