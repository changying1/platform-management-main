package com.app.myapplication.data.api;

import com.app.myapplication.data.model.Alarm;

import java.util.List;
import java.util.Map;

import retrofit2.Call;
import retrofit2.http.Body;
import retrofit2.http.DELETE;
import retrofit2.http.GET;
import retrofit2.http.POST;
import retrofit2.http.PUT;
import retrofit2.http.Path;
import retrofit2.http.Query;

public interface AlarmApi {

    @GET("/alarms/")
    Call<List<Alarm>> getAlarms();

    // 根据项目ID获取报警记录
    @GET("/alarms/")
    Call<List<Alarm>> getAlarmsByProject(@Query("project_id") long projectId);

    @GET("/alarms/")
    Call<List<Map<String, Object>>> getAlarms(
            @Query("skip") int skip,
            @Query("limit") int limit,
            @Query("project_id") Integer projectId
    );

    @POST("/alarms/")
    Call<Alarm> createAlarm(@Body Alarm alarm);

    @PUT("/alarms/{id}")
    Call<Alarm> updateAlarm(@Path("id") long id, @Body Map<String, Object> body);

    // 解决报警
    @PUT("/alarms/{id}")
    Call<Alarm> resolveAlarm(@Path("id") long id, @Body Map<String, String> body);

    @DELETE("/alarms/{id}")
    Call<Void> deleteAlarm(@Path("id") long id);
}
