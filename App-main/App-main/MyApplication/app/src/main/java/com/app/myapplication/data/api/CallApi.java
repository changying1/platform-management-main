package com.app.myapplication.data.api;

import java.util.List;
import java.util.Map;

import retrofit2.Call;
import retrofit2.http.Body;
import retrofit2.http.GET;
import retrofit2.http.POST;
import retrofit2.http.Query;

public interface CallApi {

    @GET("devices/")
    Call<List<Map<String, Object>>> getJT808Devices(@Query("skip") int skip, @Query("limit") int limit);

    @POST("call/tts/send")
    Call<Map<String, Object>> sendTTS(@Body Map<String, Object> body);

    @GET("call/records")
    Call<List<Map<String, Object>>> getCallRecords();
}
