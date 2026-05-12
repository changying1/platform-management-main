package com.app.myapplication.ui.alarm;

import android.content.Context;
import android.util.Log;

import androidx.lifecycle.LiveData;
import androidx.lifecycle.MutableLiveData;
import androidx.lifecycle.ViewModel;
import com.app.myapplication.data.api.AlarmApi;
import com.app.myapplication.data.api.ApiClient;
import com.app.myapplication.data.model.Alarm;
import com.app.myapplication.data.model.AlarmUpdateBody;
import com.app.myapplication.ui.alarm.AlarmStats;

import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.List;
import java.util.Map;
import retrofit2.Call;
import retrofit2.Callback;
import retrofit2.Response;

public class AlarmViewModel extends ViewModel {

    private final MutableLiveData<List<Alarm>> alarmData = new MutableLiveData<>();
    private final MutableLiveData<List<Alarm>> filteredAlarms = new MutableLiveData<>();  // 存储筛选后的数据
    private final MutableLiveData<AlarmStats> alarmStats = new MutableLiveData<>();
    private final MutableLiveData<Boolean> loading = new MutableLiveData<>(false);

    // 筛选器状态
    private final MutableLiveData<String> statusFilter = new MutableLiveData<>("all");
    private final MutableLiveData<String> levelFilter = new MutableLiveData<>("all");
    private final MutableLiveData<String> searchTerm = new MutableLiveData<>("");

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

    // 加载报警数据
    public void fetchAlarms(Context context) {
        AlarmApi alarmApi = ApiClient.get(context).create(AlarmApi.class);
        loading.setValue(true);

        alarmApi.getAlarms().enqueue(new Callback<List<Map<String, Object>>>() {
            @Override
            public void onResponse(Call<List<Map<String, Object>>> call, Response<List<Map<String, Object>>> response) {
                if (response.isSuccessful()) {
                    List<Map<String, Object>> alarmMaps = response.body();
                    List<Alarm> alarms = new ArrayList<>();

                    // 后处理数据，检查 deviceId 和其他字段
                    if (alarmMaps != null) {
                        for (Map<String, Object> map : alarmMaps) {
                            Alarm alarm = new Alarm();
                            alarm.setId(map.get("id") != null ? Integer.parseInt(map.get("id").toString()) : 0);
                            alarm.setDeviceId(map.get("device_id") != null ? map.get("device_id").toString() : "");
                            alarm.setDescription(map.get("msg") != null ? map.get("msg").toString() : "");
                            alarm.setAlarmType(map.get("type") != null ? map.get("type").toString() : "");
                            alarm.setStatus(map.get("status") != null ? map.get("status").toString() : "");
                            alarm.setSeverity(map.get("severity") != null ? map.get("severity").toString() : "");
                            alarm.setTimestamp(map.get("timestamp") != null ? map.get("timestamp").toString() : "");
                            
                            // 打印日志检查 deviceId 和状态字段
                            Log.d("AlarmViewModel", "Device ID: " + alarm.getDeviceId());

                            // 转换报警状态和级别
                            alarm.setStatus(translateStatus(alarm.getStatus()));
                            alarm.setSeverity(translateSeverity(alarm.getSeverity()));
                            
                            alarms.add(alarm);
                        }

                        alarmData.setValue(alarms);
                        filteredAlarms.setValue(alarms); // ✅ 必须加：默认展示全量

                        // 计算统计数据
                        AlarmStats stats = calculateStats(alarms);
                        alarmStats.setValue(stats);  // 更新统计数据
                    }
                }
                loading.setValue(false);  // 请求结束
            }

            @Override
            public void onFailure(Call<List<Map<String, Object>>> call, Throwable t) {
                loading.setValue(false); // 请求结束
                // 处理失败
            }
        });
    }

    // 计算报警统计数据
    private AlarmStats calculateStats(List<Alarm> alarms) {
        int total = alarms.size();
        int pending = 0;
        int processed = 0;
        int critical = 0;

        // 统计不同状态的报警数量
        for (Alarm alarm : alarms) {
            String sev = alarm.getSeverity();
            if ("待处理".equals(alarm.getStatus())) {
                pending++;
            } else if ("已处置".equals(alarm.getStatus())) {
                processed++;
            }
            if (sev != null) {
                sev = sev.trim();
                if ("high".equalsIgnoreCase(sev) || "高危".equals(sev) ) {
                    critical++;
                }
            }
        }

        // 返回统计数据
        return new AlarmStats(total, pending, processed, critical);
    }

    // 格式化报警编号

    // 转换状态
    private String translateStatus(String status) {
        switch (status) {
            case "pending":
                return "待处理";
            case "resolved":
                return "已处置";
            default:
                return status;
        }
    }

    // 转换级别
    private String translateSeverity(String severity) {
        switch (severity) {
            case "high":
                return "高危";
            case "medium":
                return "警告";
            case "low":
                return "提示";
            default:
                return severity;
        }
    }

    // 筛选数据
    public void filterData(String query, String status, String level) {
        List<Alarm> filteredList = new ArrayList<>();
        List<Alarm> allAlarms = alarmData.getValue();  // 获取所有的报警数据

        if (allAlarms != null) {
            Log.d("selectedStatus", "jing lai le ");
            for (Alarm alarm : allAlarms) {
                // 确保没有 null 值，若为 null 则设置为默认空字符串
                String searchQuery = query != null ? query.toLowerCase() : "";
                String alarmStatus = alarm.getStatus() != null ? alarm.getStatus().toLowerCase() : "";
                String alarmSeverity = alarm.getSeverity() != null ? alarm.getSeverity().toLowerCase() : "";
                // 检查 DeviceId 是否为 null，若为 null 则用空字符串替代
                String deviceId = alarm.getDeviceId() != null ? alarm.getDeviceId().toLowerCase() : "";
                Log.d("alarmStatus", "alarmStatus: " + alarmStatus);
                Log.d("alarmSeverity", "alarmSeverity: " + alarmSeverity);
                Log.d("status", "status: " + status);
                Log.d("level", "level: " + level);
                // 比较查询内容、状态、级别、设备 ID
                boolean matchesQuery = deviceId.contains(searchQuery); // 只对设备 ID 执行查询匹配
                boolean matchesStatus = status.equals("所有状态") || alarmStatus.equals(status); // 状态匹配
                boolean matchesLevel = level.equals("所有级别") || alarmSeverity.equals(level); // 级别匹配

                // 当查询条件、状态和级别都匹配时，加入到筛选结果中
                if (matchesQuery &&matchesStatus && matchesLevel) {
                    filteredList.add(alarm);
                }
            }
        }else {
            Log.d("selectedStatus", "cao nima ");
        }

        // 更新筛选后的数据
       filteredAlarms.setValue(filteredList);
    }

    public void deleteAlarm(Context context, int alarmId) {
        AlarmApi alarmApi = ApiClient.get(context).create(AlarmApi.class);
        loading.setValue(true);

        alarmApi.deleteAlarm(alarmId).enqueue(new Callback<Void>() {
            @Override
            public void onResponse(Call<Void> call, Response<Void> response) {
                loading.setValue(false);

                if (!response.isSuccessful()) {
                    Log.e("AlarmViewModel", "delete failed: " + response.code());
                    return;
                }

                List<Alarm> all = alarmData.getValue();
                if (all == null) return;

                // 从全量数据中移除
                List<Alarm> newAll = new ArrayList<>();
                for (Alarm a : all) {
                    if (a.getId() != alarmId) newAll.add(a);
                }

                alarmData.setValue(newAll);

                // 如果你是用 filteredAlarms 展示，需要同步刷新一下
                filteredAlarms.setValue(newAll);

                // 统计也顺便更新
                alarmStats.setValue(calculateStats(newAll));
            }

            @Override
            public void onFailure(Call<Void> call, Throwable t) {
                loading.setValue(false);
                Log.e("AlarmViewModel", "delete error", t);
            }
        });
    }
    public void resolveAlarm(Context context, int alarmId, String severity) {
        AlarmApi api = ApiClient.get(context).create(AlarmApi.class);
        loading.setValue(true);

        // 后端需要：status=resolved，severity=high/medium/low
        AlarmUpdateBody body = new AlarmUpdateBody("resolved", severity);

        api.updateAlarm(alarmId, body).enqueue(new Callback<Alarm>() {
            @Override
            public void onResponse(Call<Alarm> call, Response<Alarm> response) {
                loading.setValue(false);
                if (!response.isSuccessful()) {
                    Log.e("AlarmViewModel", "resolve failed: " + response.code());
                    return;
                }
                // ✅ 最稳妥：成功后重新拉取后端，确保状态/级别同步
                fetchAlarms(context);
            }

            @Override
            public void onFailure(Call<Alarm> call, Throwable t) {
                loading.setValue(false);
                Log.e("AlarmViewModel", "resolve error", t);
            }
        });
    }



    // 更新筛选器状态
    public void setStatusFilter(String status) {
        statusFilter.setValue(status);
    }

    public void setLevelFilter(String level) {
        levelFilter.setValue(level);
    }

    public void setSearchTerm(String search) {
        searchTerm.setValue(search);
    }
}
