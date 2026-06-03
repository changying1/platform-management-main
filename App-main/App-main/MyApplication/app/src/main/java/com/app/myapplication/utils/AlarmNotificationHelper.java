package com.app.myapplication.utils;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.media.AudioAttributes;
import android.net.Uri;
import android.os.Build;

import androidx.core.app.NotificationCompat;

import com.app.myapplication.R;
import com.app.myapplication.ui.alarm.AlarmRecordsActivity;

import java.util.concurrent.atomic.AtomicInteger;

public class AlarmNotificationHelper {

    private static final String CHANNEL_ID = "fence_alarm_channel";
    private static final String CHANNEL_NAME = "围栏报警通知";
    private static final String CHANNEL_DESC = "电子围栏闯入/越界报警通知";
    private static final AtomicInteger notificationId = new AtomicInteger(1000);

    public static void showFenceAlarmNotification(Context context, String title, String content, long alarmId) {
        NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager == null) return;

        // 创建通知渠道 (Android 8.0+)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                    CHANNEL_ID,
                    CHANNEL_NAME,
                    NotificationManager.IMPORTANCE_HIGH  // 高重要性，会显示横幅
            );
            channel.setDescription(CHANNEL_DESC);
            channel.enableVibration(true);
            channel.setVibrationPattern(new long[]{0, 500, 200, 500});
            // 设置提示音
            channel.setSound(android.provider.Settings.System.DEFAULT_NOTIFICATION_URI,
                    new AudioAttributes.Builder()
                            .setUsage(AudioAttributes.USAGE_NOTIFICATION)
                            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                            .build());
            manager.createNotificationChannel(channel);
        }

        // 点击通知跳转到报警记录页面
        Intent intent = new Intent(context, AlarmRecordsActivity.class);
        intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent pendingIntent = PendingIntent.getActivity(
                context,
                (int) alarmId,
                intent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        // 构建通知 - 使用 BigTextStyle 支持长文本
        NotificationCompat.BigTextStyle bigTextStyle = new NotificationCompat.BigTextStyle()
                .setBigContentTitle(title)
                .bigText(content);

        NotificationCompat.Builder builder = new NotificationCompat.Builder(context, CHANNEL_ID)
                .setSmallIcon(R.drawable.ic_alarm)
                .setContentTitle(title)
                .setContentText(content)
                .setStyle(bigTextStyle)
                .setPriority(NotificationCompat.PRIORITY_HIGH)  // 高优先级，显示横幅
                .setCategory(NotificationCompat.CATEGORY_ALARM)  // 报警类别
                .setDefaults(NotificationCompat.DEFAULT_ALL)     // 默认声音、震动、LED
                .setAutoCancel(true)
                .setVibrate(new long[]{0, 500, 200, 500})
                .setContentIntent(pendingIntent)
                .setFullScreenIntent(pendingIntent, true);  // 全屏意图，锁屏时显示

        manager.notify((int) alarmId, builder.build());
    }

    public static int getNextNotificationId() {
        return notificationId.incrementAndGet();
    }
}
