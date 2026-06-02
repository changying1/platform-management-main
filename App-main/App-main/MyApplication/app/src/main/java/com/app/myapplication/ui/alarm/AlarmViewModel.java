package com.app.myapplication.ui.alarm;

import android.content.Context;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;

import androidx.lifecycle.LiveData;
import androidx.lifecycle.MutableLiveData;
import androidx.lifecycle.ViewModel;

import com.app.myapplication.data.api.AlarmApi;
import com.app.myapplication.data.api.ApiClient;
import com.app.myapplication.data.model.Alarm;
import com.app.myapplication.utils.AlarmNotificationHelper;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

import retrofit2.Call;
import retrofit2.Callback;
import retrofit2.Response;

public class AlarmViewModel extends ViewModel {

    private final MutableLiveData<List<Alarm>> alarmData = new MutableLiveData<>();
    private final MutableLiveData<List<Alarm>> filteredAlarms = new MutableLiveData<>();
    private final MutableLiveData<AlarmStats> alarmStats = new MutableLiveData<>();
    private final MutableLiveData<Boolean> loading = new MutableLiveData<>(false);

    // 筛选器状态
    private final MutableLiveData<String> statusFilter = new MutableLiveData<>("all");
    private final MutableLiveData<String> levelFilter = new MutableLiveData<>("all");
    private final MutableLiveData<String> searchTerm = new MutableLiveData<>("");

    // 轮询相关
    private Handler pollingHandler;
    private Runnable pollingRunnable;
    private static final long POLLING_INTERVAL = 2000; // 2秒
    private Context appContext;

    // 已通知的报警ID集合，避免重复通知
    private final Set<Long> notifiedAlarmIds = new HashSet<>();

    public AlarmViewModel() {
        pollingHandler = new Handler(Looper.getMainLooper());
    }

    @Override
    protected void onCleared() {
        super.onCleared();
        stopPolling();
    }

    // 开始轮询
    public void startPolling(Context context) {
        this.appContext = context.getApplicationContext();
        stopPolling(); // 先停止之前的轮询

        pollingRunnable = new Runnable() {
            @Override
            public void run() {
                fetchAlarms(appContext);
                pollingHandler.postDelayed(this, POLLING_INTERVAL);
            }
        };

        // 立即执行一次，然后开始轮询
        pollingRunnable.run();
        Log.d("AlarmViewModel", "Started polling alarms every " + POLLING_INTERVAL + "ms");
    }

    // 停止轮询
    public void stopPolling() {
        if (pollingHandler != null && pollingRunnable != null) {
            pollingHandler.removeCallbacks(pollingRunnable);
            Log.d("AlarmViewModel", "Stopped polling alarms");
        }
    }

    // 获取报警数据
    public LiveData<List<Alarm>> getAlarmData() {
        return alarmData;
    }

    // 获取筛选后的报警数据
    public LiveData<List<Alarm>> getFilteredAlarms() {
        return filteredAlarms;
    }

    // 获取报警统计数据
    public LiveData<AlarmStats> getAlarmStats() {
        return alarmStats;
    }

    // 获取加载状态
    public LiveData<Boolean> getLoading() {
        return loading;
    }

    // 加载报警数据
    public void fetchAlarms(Context context) {
        AlarmApi alarmApi = ApiClient.get(context).create(AlarmApi.class);
        loading.setValue(true);

        alarmApi.getAlarms().enqueue(new Callback<List<Alarm>>() {
            @Override
            public void onResponse(Call<List<Alarm>> call, Response<List<Alarm>> response) {
                loading.setValue(false);

                if (response.isSuccessful() && response.body() != null) {
                    List<Alarm> alarms = response.body();
                    Log.d("AlarmViewModel", "Fetched " + alarms.size() + " alarms");

                    // 获取当前所有pending状态的围栏报警
                    List<Alarm> pendingFenceAlarms = new ArrayList<>();
                    for (Alarm alarm : alarms) {
                        if (isFenceAlarm(alarm) && "pending".equals(alarm.getDisplayStatus())) {
                            pendingFenceAlarms.add(alarm);
                        }
                    }
                    
                    Log.d("AlarmViewModel", "Found " + pendingFenceAlarms.size() + " pending fence alarms");
                    
                    // 获取当前所有pending状态的围栏报警ID
                    Set<Long> currentPendingFenceAlarmIds = new HashSet<>();
                    for (Alarm alarm : pendingFenceAlarms) {
                        currentPendingFenceAlarmIds.add(alarm.getId());
                    }
                    
                    // 清理已不在pending状态的报警ID（避免集合无限增长）
                    notifiedAlarmIds.retainAll(currentPendingFenceAlarmIds);

                    // 获取未通知的新报警
                    List<Alarm> newAlarms = new ArrayList<>();
                    for (Alarm alarm : pendingFenceAlarms) {
                        if (!notifiedAlarmIds.contains(alarm.getId())) {
                            newAlarms.add(alarm);
                        }
                    }
                    
                    Log.d("AlarmViewModel", "Found " + newAlarms.size() + " new fence alarms to notify");
                    
                    // 发送通知 - 如果有多条pending报警，合并显示
                    if (!newAlarms.isEmpty()) {
                        if (pendingFenceAlarms.size() == 1) {
                            // 只有一条pending报警，单独显示
                            Alarm alarm = pendingFenceAlarms.get(0);
                            sendFenceAlarmNotification(alarm);
                            notifiedAlarmIds.add(alarm.getId());
                            Log.d("AlarmViewModel", "Sent single notification for alarm ID: " + alarm.getId());
                        } else {
                            // 多条pending报警，合并显示所有pending的（不只是新的）
                            sendMergedFenceAlarmNotification(pendingFenceAlarms);
                            for (Alarm alarm : newAlarms) {
                                notifiedAlarmIds.add(alarm.getId());
                            }
                            Log.d("AlarmViewModel", "Sent merged notification for " + pendingFenceAlarms.size() + " total pending alarms");
                        }
                    }

                    alarmData.setValue(alarms);
                    applyFilters();

                    // 计算统计数据
                    AlarmStats stats = calculateStats(alarms);
                    alarmStats.setValue(stats);
                } else {
                    Log.e("AlarmViewModel", "Failed to fetch alarms: " + response.code());
                }
            }

            @Override
            public void onFailure(Call<List<Alarm>> call, Throwable t) {
                loading.setValue(false);
                Log.e("AlarmViewModel", "Error fetching alarms", t);
            }
        });
    }

    // 计算报警统计数据
    private AlarmStats calculateStats(List<Alarm> alarms) {
        int total = alarms.size();
        int pending = 0;
        int resolved = 0;
        int high = 0;
        int medium = 0;
        int low = 0;

        for (Alarm alarm : alarms) {
            String status = alarm.getDisplayStatus();
            String severity = alarm.getDisplaySeverity();

            if ("pending".equals(status)) {
                pending++;
            } else if ("resolved".equals(status)) {
                resolved++;
            }

            if ("high".equals(severity)) {
                high++;
            } else if ("medium".equals(severity)) {
                medium++;
            } else if ("low".equals(severity)) {
                low++;
            }
        }

        return new AlarmStats(total, pending, resolved, high, medium, low);
    }

    // 应用筛选
    private void applyFilters() {
        List<Alarm> allAlarms = alarmData.getValue();
        if (allAlarms == null) {
            filteredAlarms.setValue(new ArrayList<>());
            return;
        }

        String status = statusFilter.getValue();
        String level = levelFilter.getValue();
        String search = searchTerm.getValue();

        if (status == null) status = "all";
        if (level == null) level = "all";
        if (search == null) search = "";

        List<Alarm> filteredList = new ArrayList<>();

        for (Alarm alarm : allAlarms) {
            boolean matchesStatus = "all".equals(status) ||
                    status.equals(alarm.getDisplayStatus());

            boolean matchesLevel = "all".equals(level) ||
                    level.equals(alarm.getDisplaySeverity());

            String searchLower = search.toLowerCase();
            boolean matchesSearch = search.isEmpty() ||
                    (alarm.getDeviceId() != null && alarm.getDeviceId().toLowerCase().contains(searchLower)) ||
                    (alarm.getDescription() != null && alarm.getDescription().toLowerCase().contains(searchLower)) ||
                    (alarm.getDisplayAlarmType() != null && alarm.getDisplayAlarmType().toLowerCase().contains(searchLower));

            if (matchesStatus && matchesLevel && matchesSearch) {
                filteredList.add(alarm);
            }
        }

        filteredAlarms.setValue(filteredList);
    }

    // 筛选数据（供外部调用）
    public void filterData(String query, String status, String level) {
        searchTerm.setValue(query);
        statusFilter.setValue(status);
        levelFilter.setValue(level);
        applyFilters();
    }

    // 删除报警
    public void deleteAlarm(Context context, long alarmId) {
        AlarmApi alarmApi = ApiClient.get(context).create(AlarmApi.class);
        loading.setValue(true);

        alarmApi.deleteAlarm(alarmId).enqueue(new Callback<Void>() {
            @Override
            public void onResponse(Call<Void> call, Response<Void> response) {
                loading.setValue(false);

                if (response.isSuccessful()) {
                    Log.d("AlarmViewModel", "Deleted alarm: " + alarmId);
                    // 重新获取数据
                    fetchAlarms(context);
                } else {
                    Log.e("AlarmViewModel", "Failed to delete alarm: " + response.code());
                }
            }

            @Override
            public void onFailure(Call<Void> call, Throwable t) {
                loading.setValue(false);
                Log.e("AlarmViewModel", "Error deleting alarm", t);
            }
        });
    }

    // 解决报警
    public void resolveAlarm(Context context, long alarmId, String severity) {
        AlarmApi api = ApiClient.get(context).create(AlarmApi.class);
        loading.setValue(true);

        Map<String, Object> body = new HashMap<>();
        body.put("status", "resolved");
        if (severity != null) {
            body.put("severity", severity);
        }

        api.updateAlarm(alarmId, body).enqueue(new Callback<Alarm>() {
            @Override
            public void onResponse(Call<Alarm> call, Response<Alarm> response) {
                loading.setValue(false);
                if (response.isSuccessful()) {
                    Log.d("AlarmViewModel", "Resolved alarm: " + alarmId);
                    // 重新获取数据
                    fetchAlarms(context);
                } else {
                    Log.e("AlarmViewModel", "Failed to resolve alarm: " + response.code());
                }
            }

            @Override
            public void onFailure(Call<Alarm> call, Throwable t) {
                loading.setValue(false);
                Log.e("AlarmViewModel", "Error resolving alarm", t);
            }
        });
    }

    // 更新筛选器状态
    public void setStatusFilter(String status) {
        statusFilter.setValue(status);
        applyFilters();
    }

    public void setLevelFilter(String level) {
        levelFilter.setValue(level);
        applyFilters();
    }

    public void setSearchTerm(String search) {
        searchTerm.setValue(search);
        applyFilters();
    }

    // 判断是否为围栏报警
    private boolean isFenceAlarm(Alarm alarm) {
        String alarmSource = alarm.getAlarmSource();
        String sourceType = alarm.getSourceType();
        String alarmType = alarm.getAlarmType();
        String description = alarm.getDescription();
        
        // 检查 alarm_source 或 source_type
        if ("fence".equals(alarmSource) || "fence".equals(sourceType)) {
            return true;
        }
        
        // 检查 alarm_type 是否包含"围栏"
        if (alarmType != null && (alarmType.contains("围栏") || alarmType.toLowerCase().contains("fence"))) {
            return true;
        }
        
        // 检查 description 是否包含围栏相关关键词
        if (description != null && (description.contains("围栏") || description.contains("禁入") || description.contains("禁出"))) {
            return true;
        }
        
        return false;
    }

    // 发送围栏报警通知
    private void sendFenceAlarmNotification(Alarm alarm) {
        if (appContext == null) return;

        String title = alarm.getDisplayAlarmType();
        String deviceName = alarm.getDeviceName() != null ? alarm.getDeviceName() : alarm.getDeviceId();
        String location = alarm.getLocation() != null ? alarm.getLocation() : "未知位置";
        String content = String.format("设备: %s\n位置: %s\n时间: %s",
                deviceName,
                location,
                alarm.getTimestamp() != null ? alarm.getTimestamp() : "刚刚");

        AlarmNotificationHelper.showFenceAlarmNotification(
                appContext,
                title,
                content,
                alarm.getId()
        );
    }

    // 发送合并的围栏报警通知
    private void sendMergedFenceAlarmNotification(List<Alarm> alarms) {
        if (appContext == null || alarms.isEmpty()) return;

        // 获取第一个报警的信息作为主标题
        Alarm firstAlarm = alarms.get(0);
        String title = "电子围栏报警 (" + alarms.size() + "条)";
        
        // 构建内容：显示前3条报警详情
        StringBuilder contentBuilder = new StringBuilder();
        int displayCount = Math.min(alarms.size(), 3);
        
        for (int i = 0; i < displayCount; i++) {
            Alarm alarm = alarms.get(i);
            String deviceName = alarm.getDeviceName() != null ? alarm.getDeviceName() : alarm.getDeviceId();
            String personName = alarm.getPersonName() != null ? alarm.getPersonName() : "未知";
            String description = alarm.getDescription() != null ? alarm.getDescription() : alarm.getAlarmType();
            
            contentBuilder.append(String.format("%d. %s (%s)\n   %s\n",
                    i + 1,
                    personName,
                    deviceName,
                    description));
        }
        
        if (alarms.size() > 3) {
            contentBuilder.append("... 还有 ").append(alarms.size() - 3).append(" 条报警");
        }

        // 使用固定ID，避免多条通知
        AlarmNotificationHelper.showFenceAlarmNotification(
                appContext,
                title,
                contentBuilder.toString(),
                999999L  // 固定ID，合并通知
        );
    }
}
