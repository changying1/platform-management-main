package com.app.myapplication.ui.call;

import android.content.Intent;
import android.os.Bundle;
import android.text.TextUtils;
import android.view.Gravity;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;

import androidx.annotation.NonNull;
import androidx.appcompat.app.AppCompatActivity;

import com.app.myapplication.data.api.ApiClient;
import com.app.myapplication.data.api.AppVoiceCallApi;
import com.app.myapplication.data.model.call.AppVoiceRoom;
import com.app.myapplication.data.model.call.AppVoiceRoomActionRequest;

import retrofit2.Call;
import retrofit2.Callback;
import retrofit2.Response;

public class IncomingVoiceCallActivity extends AppCompatActivity {
    private String roomId;
    private String userId;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        roomId = getIntent().getStringExtra(VoiceRoomActivity.EXTRA_ROOM_ID);
        userId = getIntent().getStringExtra(VoiceRoomActivity.EXTRA_USER_ID);
        String title = getIntent().getStringExtra(AppVoiceCallInviteService.EXTRA_ROOM_TITLE);
        if (TextUtils.isEmpty(title)) {
            title = "App 群组语音通话";
        }

        if (TextUtils.isEmpty(roomId) || TextUtils.isEmpty(userId)) {
            finish();
            return;
        }

        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setGravity(Gravity.CENTER);
        int padding = dp(28);
        root.setPadding(padding, padding, padding, padding);
        root.setBackgroundColor(0xFFF4F7FB);

        TextView heading = new TextView(this);
        heading.setText("收到语音通话邀请");
        heading.setTextSize(24);
        heading.setTextColor(0xFF17212B);
        heading.setGravity(Gravity.CENTER);
        heading.setTypeface(null, android.graphics.Typeface.BOLD);
        root.addView(heading, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT
        ));

        TextView message = new TextView(this);
        message.setText(title);
        message.setTextSize(16);
        message.setTextColor(0xFF455A64);
        message.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams messageParams = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT
        );
        messageParams.setMargins(0, dp(16), 0, dp(28));
        root.addView(message, messageParams);

        Button accept = new Button(this);
        accept.setText("接听");
        root.addView(accept, buttonParams());

        Button reject = new Button(this);
        reject.setText("拒绝");
        LinearLayout.LayoutParams rejectParams = buttonParams();
        rejectParams.setMargins(0, dp(12), 0, 0);
        root.addView(reject, rejectParams);

        accept.setOnClickListener(v -> openVoiceRoom());
        reject.setOnClickListener(v -> rejectRoom());

        setContentView(root);
    }

    private LinearLayout.LayoutParams buttonParams() {
        return new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                dp(52)
        );
    }

    private void openVoiceRoom() {
        AppVoiceCallInviteService.cancelInviteNotification(this, roomId);
        Intent intent = new Intent(this, VoiceRoomActivity.class);
        intent.putExtra(VoiceRoomActivity.EXTRA_ROOM_ID, roomId);
        intent.putExtra(VoiceRoomActivity.EXTRA_USER_ID, userId);
        intent.putExtra(VoiceRoomActivity.EXTRA_IS_INITIATOR, false);
        startActivity(intent);
        finish();
    }

    private void rejectRoom() {
        AppVoiceCallInviteService.cancelInviteNotification(this, roomId);
        ApiClient.get(this).create(AppVoiceCallApi.class)
                .rejectRoom(roomId, new AppVoiceRoomActionRequest(userId))
                .enqueue(new Callback<AppVoiceRoom>() {
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

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }
}
