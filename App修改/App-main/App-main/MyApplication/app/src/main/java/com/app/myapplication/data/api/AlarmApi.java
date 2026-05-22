package com.app.myapplication.data.api;

import com.app.myapplication.data.model.Alarm;
import com.app.myapplication.data.model.AlarmUpdateBody;

import java.util.List;
import java.util.Map;

import retrofit2.Call;
import retrofit2.http.Body;
import retrofit2.http.DELETE;
import retrofit2.http.GET;
import retrofit2.http.POST;
import retrofit2.http.PUT;
import retrofit2.http.Path;

public interface AlarmApi {

    // 获取所有报警记录
    @GET("/alarms/")
    Call<List<Map<String, Object>>> getAlarms();

    // 创建报警记录
    @POST("/alarms/")
    Call<Alarm> createAlarm(@Body Alarm alarm);

    // 更新报警记录
    @PUT("/alarms/{id}")
    Call<Alarm> updateAlarm(@Path("id") int id, @Body AlarmUpdateBody body);

    // 删除报警记录
    @DELETE("/alarms/{id}")
    Call<Void> deleteAlarm(@Path("id") int id);
}
