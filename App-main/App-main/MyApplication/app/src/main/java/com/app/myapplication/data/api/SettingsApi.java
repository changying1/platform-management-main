package com.app.myapplication.data.api;

import com.google.gson.JsonObject;

import java.util.Map;

import retrofit2.Call;
import retrofit2.http.Body;
import retrofit2.http.GET;
import retrofit2.http.HeaderMap;
import retrofit2.http.POST;

/**
 * 全局设置 API 接口
 * 与 Web 端 /admin/settings 对齐
 */
public interface SettingsApi {

    /**
     * 获取系统设置
     */
    @GET("admin/settings")
    Call<JsonObject> getSettings(@HeaderMap Map<String, String> headers);

    /**
     * 保存系统设置
     */
    @POST("admin/settings")
    Call<JsonObject> saveSettings(@HeaderMap Map<String, String> headers, @Body JsonObject settings);
}
