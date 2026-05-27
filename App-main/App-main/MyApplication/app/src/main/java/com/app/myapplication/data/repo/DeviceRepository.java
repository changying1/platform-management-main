package com.app.myapplication.data.repo;

import android.content.Context;

import androidx.annotation.NonNull;

import com.app.myapplication.data.api.ApiClient;
import com.app.myapplication.data.api.DeviceApi;
import com.app.myapplication.data.model.DeviceItem;
import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;

import java.util.ArrayList;
import java.util.List;

import retrofit2.Call;
import retrofit2.Callback;
import retrofit2.Response;

/**
 * 设备数据仓库
 * 负责设备相关的网络请求和数据处理
 */
public class DeviceRepository {

    private final DeviceApi api;

    public DeviceRepository(Context ctx) {
        api = ApiClient.get(ctx.getApplicationContext()).create(DeviceApi.class);
    }

    public interface DataCallback<T> {
        void onSuccess(T data);
        void onError(String msg);
    }

    /**
     * 获取所有设备列表
     */
    public void loadDevices(DataCallback<List<DeviceItem>> cb) {
        api.getDeviceList().enqueue(new Callback<JsonArray>() {
            @Override
            public void onResponse(@NonNull Call<JsonArray> call, @NonNull Response<JsonArray> resp) {
                if (!resp.isSuccessful() || resp.body() == null) {
                    cb.onError("获取设备列表失败: " + resp.code());
                    return;
                }

                List<DeviceItem> devices = new ArrayList<>();
                for (JsonElement e : resp.body()) {
                    if (e != null && e.isJsonObject()) {
                        devices.add(DeviceItem.fromJson(e.getAsJsonObject()));
                    }
                }
                cb.onSuccess(devices);
            }

            @Override
            public void onFailure(@NonNull Call<JsonArray> call, @NonNull Throwable t) {
                cb.onError("网络错误: " + t.getMessage());
            }
        });
    }

    /**
     * 获取设备详情
     */
    public void getDeviceById(String deviceId, DataCallback<DeviceItem> cb) {
        api.getDeviceById(deviceId).enqueue(new Callback<JsonObject>() {
            @Override
            public void onResponse(@NonNull Call<JsonObject> call, @NonNull Response<JsonObject> resp) {
                if (!resp.isSuccessful() || resp.body() == null) {
                    cb.onError("获取设备详情失败: " + resp.code());
                    return;
                }
                cb.onSuccess(DeviceItem.fromJson(resp.body()));
            }

            @Override
            public void onFailure(@NonNull Call<JsonObject> call, @NonNull Throwable t) {
                cb.onError("网络错误: " + t.getMessage());
            }
        });
    }

    /**
     * 创建设备
     */
    public void createDevice(DeviceApi.DeviceCreateRequest request, DataCallback<DeviceItem> cb) {
        api.createDevice(request).enqueue(new Callback<JsonObject>() {
            @Override
            public void onResponse(@NonNull Call<JsonObject> call, @NonNull Response<JsonObject> resp) {
                if (!resp.isSuccessful() || resp.body() == null) {
                    cb.onError("创建设备失败: " + resp.code());
                    return;
                }
                cb.onSuccess(DeviceItem.fromJson(resp.body()));
            }

            @Override
            public void onFailure(@NonNull Call<JsonObject> call, @NonNull Throwable t) {
                cb.onError("网络错误: " + t.getMessage());
            }
        });
    }

    /**
     * 更新设备
     */
    public void updateDevice(String deviceId, DeviceApi.DeviceUpdateRequest request, DataCallback<DeviceItem> cb) {
        api.updateDevice(deviceId, request).enqueue(new Callback<JsonObject>() {
            @Override
            public void onResponse(@NonNull Call<JsonObject> call, @NonNull Response<JsonObject> resp) {
                if (!resp.isSuccessful() || resp.body() == null) {
                    cb.onError("更新设备失败: " + resp.code());
                    return;
                }
                cb.onSuccess(DeviceItem.fromJson(resp.body()));
            }

            @Override
            public void onFailure(@NonNull Call<JsonObject> call, @NonNull Throwable t) {
                cb.onError("网络错误: " + t.getMessage());
            }
        });
    }

    /**
     * 删除设备
     */
    public void deleteDevice(String deviceId, DataCallback<Boolean> cb) {
        api.deleteDevice(deviceId).enqueue(new Callback<JsonObject>() {
            @Override
            public void onResponse(@NonNull Call<JsonObject> call, @NonNull Response<JsonObject> resp) {
                if (!resp.isSuccessful()) {
                    cb.onError("删除设备失败: " + resp.code());
                    return;
                }
                cb.onSuccess(true);
            }

            @Override
            public void onFailure(@NonNull Call<JsonObject> call, @NonNull Throwable t) {
                cb.onError("网络错误: " + t.getMessage());
            }
        });
    }
}
