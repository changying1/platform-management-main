package com.app.myapplication.data.api;

import com.app.myapplication.data.model.TrackDevice;

import java.util.List;
import java.util.Map;

import retrofit2.Call;
import retrofit2.http.GET;
import retrofit2.http.Path;
import retrofit2.http.Query;

public interface TrackApi {

    @GET("device/devices")
    Call<List<TrackDevice>> getDevices();

    @GET("device/{deviceId}")
    Call<TrackDevice> getDeviceTrajectory(
            @Path("deviceId") String deviceId,
            @Query("hours") int hours
    );

    @GET("device/trajectories/summary")
    Call<List<Map<String, Object>>> getTrajectorySummaries(
            @Query("hours") int hours,
            @Query("start_time") String startTime,
            @Query("end_time") String endTime
    );

    @GET("device/trajectories/{deviceId}/points")
    Call<Map<String, Object>> getTrajectoryPoints(
            @Path("deviceId") String deviceId,
            @Query("hours") int hours,
            @Query("start_time") String startTime,
            @Query("end_time") String endTime
    );
}
