package com.app.myapplication.data.api;

import com.app.myapplication.data.model.TrackResponse;

import retrofit2.Call;
import retrofit2.http.GET;
import retrofit2.http.Query;

public interface TrackApi {

    // TODO: 等后端给接口后替换路径与参数
    @GET("track/query")
    Call<TrackResponse> queryTrack(
            @Query("keyword") String keyword,
            @Query("startDate") String startDate,
            @Query("endDate") String endDate
    );
}