package com.app.myapplication.ui.call;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.text.TextUtils;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.core.app.ActivityCompat;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;

import com.app.myapplication.R;
import com.app.myapplication.data.api.ApiClient;
import com.app.myapplication.data.api.AppVoiceCallApi;
import com.app.myapplication.data.local.SessionManager;
import com.app.myapplication.data.model.call.AppVoiceMember;
import com.app.myapplication.data.model.call.AppVoiceRoom;
import com.app.myapplication.data.model.call.AppVoiceRoomActionRequest;

import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;

import retrofit2.Call;
import retrofit2.Callback;
import retrofit2.Response;

public class AppVoiceCallInviteService extends Service {
    public static final String ACTION_REJECT = "com.app.myapplication.call.REJECT";
    public static final String EXTRA_ROOM_ID = "room_id";
    public static final String EXTRA_ROOM_TITLE = "room_title";

    private static final String LISTENING_CHANNEL_ID = "voice_call_listening";
    private static final String INVITE_CHANNEL_ID = "voice_call_invite";
    private static final int LISTENING_NOTIFICATION_ID = 3001;

    private final AppVoiceCallSocket callSocket = new AppVoiceCallSocket();
    private final Handler handler = new Handler(Looper.getMainLooper());
    private final Set<String> notifiedRooms = new HashSet<>();
    private boolean polling;

    private final Runnable pollRunnable = new Runnable() {
        @Override
        public void run() {
            pollIncomingRooms();
            if (polling) {
                handler.postDelayed(this, 3000);
            }
        }
    };

    public static void start(Context context) {
        Intent intent = new Intent(context, AppVoiceCallInviteService.class);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            context.startForegroundService(intent);
        } else {
            context.startService(intent);
        }
    }

    public static void stop(Context context) {
        context.stopService(new Intent(context, AppVoiceCallInviteService.class));
    }

    public static void cancelInviteNotification(Context context, String roomId) {
        if (TextUtils.isEmpty(roomId)) {
            return;
        }
        NotificationManagerCompat.from(context).cancel(inviteNotificationId(roomId));
    }

    @Override
    public void onCreate() {
        super.onCreate();
        createNotificationChannels();
        startForeground(LISTENING_NOTIFICATION_ID, buildListeningNotification());
        startListening();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null && ACTION_REJECT.equals(intent.getAction())) {
            rejectRoom(intent.getStringExtra(EXTRA_ROOM_ID));
            return START_STICKY;
        }
        startListening();
        return START_STICKY;
    }

    @Nullable
    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public void onDestroy() {
        polling = false;
        handler.removeCallbacks(pollRunnable);
        callSocket.close();
        super.onDestroy();
    }

    private void startListening() {
        String userId = new SessionManager(this).getUserId();
        if (TextUtils.isEmpty(userId)) {
            stopSelf();
            return;
        }

        callSocket.connect(this, userId, new AppVoiceCallSocket.Listener() {
            @Override
            public void onInvite(AppVoiceRoom room) {
                notifyIfIncoming(room);
            }

            @Override
            public void onDisconnected() {
            }
        });

        if (!polling) {
            polling = true;
            handler.post(pollRunnable);
        }
    }

    private void pollIncomingRooms() {
        String userId = new SessionManager(this).getUserId();
        if (TextUtils.isEmpty(userId)) {
            stopSelf();
            return;
        }

        ApiClient.get(this).create(AppVoiceCallApi.class)
                .getRooms(userId, null, 20)
                .enqueue(new Callback<List<AppVoiceRoom>>() {
                    @Override
                    public void onResponse(@NonNull Call<List<AppVoiceRoom>> call, @NonNull Response<List<AppVoiceRoom>> response) {
                        if (!response.isSuccessful() || response.body() == null) {
                            return;
                        }
                        for (AppVoiceRoom room : response.body()) {
                            notifyIfIncoming(room);
                        }
                    }

                    @Override
                    public void onFailure(@NonNull Call<List<AppVoiceRoom>> call, @NonNull Throwable t) {
                    }
                });
    }

    private void notifyIfIncoming(AppVoiceRoom room) {
        String userId = new SessionManager(this).getUserId();
        if (!isIncomingForCurrentUser(room, userId)) {
            return;
        }
        if (!notifiedRooms.add(room.roomId)) {
            return;
        }
        showInviteNotification(room, userId);
    }

    private boolean isIncomingForCurrentUser(AppVoiceRoom room, String userId) {
        if (room == null || TextUtils.isEmpty(room.roomId) || TextUtils.isEmpty(userId) || TextUtils.equals(room.initiatorId, userId)) {
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

    private void showInviteNotification(AppVoiceRoom room, String userId) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU
                && ActivityCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            return;
        }

        String title = TextUtils.isEmpty(room.title) ? "App 群组语音通话" : room.title;
        Intent incomingIntent = new Intent(this, IncomingVoiceCallActivity.class);
        incomingIntent.putExtra(VoiceRoomActivity.EXTRA_ROOM_ID, room.roomId);
        incomingIntent.putExtra(VoiceRoomActivity.EXTRA_USER_ID, userId);
        incomingIntent.putExtra(EXTRA_ROOM_TITLE, title);
        incomingIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);

        PendingIntent incomingPendingIntent = PendingIntent.getActivity(
                this,
                room.roomId.hashCode(),
                incomingIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        Intent rejectIntent = new Intent(this, AppVoiceCallInviteService.class);
        rejectIntent.setAction(ACTION_REJECT);
        rejectIntent.putExtra(EXTRA_ROOM_ID, room.roomId);
        PendingIntent rejectPendingIntent = PendingIntent.getService(
                this,
                room.roomId.hashCode() + 1,
                rejectIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        Notification notification = new NotificationCompat.Builder(this, INVITE_CHANNEL_ID)
                .setSmallIcon(R.drawable.ic_alarm)
                .setContentTitle("收到语音通话邀请")
                .setContentText(title)
                .setStyle(new NotificationCompat.BigTextStyle().bigText(title))
                .setPriority(NotificationCompat.PRIORITY_MAX)
                .setCategory(NotificationCompat.CATEGORY_CALL)
                .setOngoing(true)
                .setAutoCancel(true)
                .setContentIntent(incomingPendingIntent)
                .setFullScreenIntent(incomingPendingIntent, true)
                .addAction(0, "接听", incomingPendingIntent)
                .addAction(0, "拒绝", rejectPendingIntent)
                .build();

        NotificationManagerCompat.from(this).notify(inviteNotificationId(room.roomId), notification);
    }

    private void rejectRoom(String roomId) {
        String userId = new SessionManager(this).getUserId();
        if (TextUtils.isEmpty(roomId) || TextUtils.isEmpty(userId)) {
            return;
        }
        cancelInviteNotification(this, roomId);
        ApiClient.get(this).create(AppVoiceCallApi.class)
                .rejectRoom(roomId, new AppVoiceRoomActionRequest(userId))
                .enqueue(new Callback<AppVoiceRoom>() {
                    @Override
                    public void onResponse(@NonNull Call<AppVoiceRoom> call, @NonNull Response<AppVoiceRoom> response) {
                    }

                    @Override
                    public void onFailure(@NonNull Call<AppVoiceRoom> call, @NonNull Throwable t) {
                    }
                });
    }

    private Notification buildListeningNotification() {
        return new NotificationCompat.Builder(this, LISTENING_CHANNEL_ID)
                .setSmallIcon(R.drawable.ic_alarm)
                .setContentTitle("语音通话监听中")
                .setContentText("后台接收语音通话邀请")
                .setPriority(NotificationCompat.PRIORITY_LOW)
                .setOngoing(true)
                .build();
    }

    private void createNotificationChannels() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            return;
        }
        NotificationManager manager = getSystemService(NotificationManager.class);
        if (manager == null) {
            return;
        }
        NotificationChannel listening = new NotificationChannel(
                LISTENING_CHANNEL_ID,
                "语音通话监听",
                NotificationManager.IMPORTANCE_LOW
        );
        listening.setDescription("保持后台接收语音通话邀请");
        manager.createNotificationChannel(listening);

        NotificationChannel invite = new NotificationChannel(
                INVITE_CHANNEL_ID,
                "语音通话邀请",
                NotificationManager.IMPORTANCE_HIGH
        );
        invite.setDescription("收到语音通话邀请时提醒");
        manager.createNotificationChannel(invite);
    }

    private static int inviteNotificationId(String roomId) {
        return 4000 + Math.abs(String.format(Locale.ROOT, "%s", roomId).hashCode() % 50000);
    }
}
