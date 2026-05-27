package com.app.myapplication.data.api;

import com.app.myapplication.data.model.DeviceItem;
import com.google.gson.JsonArray;
import com.google.gson.JsonObject;

import java.util.List;

import retrofit2.Call;
import retrofit2.http.Body;
import retrofit2.http.DELETE;
import retrofit2.http.GET;
import retrofit2.http.POST;
import retrofit2.http.PUT;
import retrofit2.http.Path;
import retrofit2.http.Query;

/**
 * 设备相关 API 接口
 * 对应后端 device_controller.py
 */
public interface DeviceApi {

    /**
     * 获取所有设备列表
     * GET /device/list
     */
    @GET("device/list")
    Call<JsonArray> getDeviceList();

    /**
     * 获取所有设备列表（兼容接口）
     * GET /device/devices
     */
    @GET("device/devices")
    Call<JsonArray> getAllDevices();

    /**
     * 根据 device_id 获取设备详情
     * GET /device/{device_id}
     */
    @GET("device/{device_id}")
    Call<JsonObject> getDeviceById(@Path("device_id") String deviceId);

    /**
     * 创建设备
     * POST /device/add
     */
    @POST("device/add")
    Call<JsonObject> createDevice(@Body DeviceCreateRequest request);

    /**
     * 更新设备
     * PUT /device/update/{device_id}
     */
    @PUT("device/update/{device_id}")
    Call<JsonObject> updateDevice(@Path("device_id") String deviceId, @Body DeviceUpdateRequest request);

    /**
     * 删除设备
     * DELETE /device/delete/{device_id}
     */
    @DELETE("device/delete/{device_id}")
    Call<JsonObject> deleteDevice(@Path("device_id") String deviceId);

    /**
     * 创建设备请求体
     */
    class DeviceCreateRequest {
        public String device_id;
        public String name;
        public Double lat;
        public Double lng;
        public String company;
        public String project;
        public String type;
        public String team;
        public String status;
        public String holder;
        public String holderPhone;
        public String remark;
    }

    /**
     * 更新设备请求体
     */
    class DeviceUpdateRequest {
        public String name;
        public Double lat;
        public Double lng;
        public String company;
        public String project;
        public String type;
        public String team;
        public String status;
        public String holder;
        public String holderPhone;
        public String remark;
    }

    /**
     * 更新设备位置（调试用）
     * POST /device/update-position
     */
    @POST("device/update-position")
    Call<JsonObject> updateDevicePosition(@Body DevicePositionUpdateRequest request);

    /**
     * 更新设备位置请求体
     */
    class DevicePositionUpdateRequest {
        public String device_id;
        public double lat;
        public double lng;

        public DevicePositionUpdateRequest(String deviceId, double lat, double lng) {
            this.device_id = deviceId;
            this.lat = lat;
            this.lng = lng;
        }
    }
}
