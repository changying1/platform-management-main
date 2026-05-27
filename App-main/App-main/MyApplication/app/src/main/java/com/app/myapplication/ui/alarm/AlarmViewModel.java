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

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

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
    private static final long POLLING_INTERVAL = 30000; // 30秒
    private Context appContext;

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

                    // 打印围栏相关报警
                    for (Alarm alarm : alarms) {
                        if ("fence".equals(alarm.getAlarmSource()) ||
                            "fence".equals(alarm.getSourceType()) ||
                            (alarm.getAlarmType() != null && alarm.getAlarmType().contains("fence"))) {
                            Log.d("AlarmViewModel", "Fence alarm: " + alarm.getAlarmType() +
                                    " - " + alarm.getDisplayAlarmType() +
                                    " - Device: " + alarm.getDeviceId());
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
}
