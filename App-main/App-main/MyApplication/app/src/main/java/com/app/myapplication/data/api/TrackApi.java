package com.app.myapplication.data.api;

import com.app.myapplication.data.model.TrackDevice;
import com.app.myapplication.data.model.TrackDeviceListResponse;

import java.util.List;

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
}
