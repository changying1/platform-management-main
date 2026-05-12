package com.app.myapplication.data.api;

import com.app.myapplication.data.model.VideoDevice;

import java.util.List;
import java.util.Map;

import retrofit2.Call;
import retrofit2.http.Body;
import retrofit2.http.DELETE;
import retrofit2.http.GET;
import retrofit2.http.POST;
import retrofit2.http.PUT;
import retrofit2.http.Path;

public interface VideoApi {

    @GET("video/")
    Call<List<VideoDevice>> getDevices();

    @POST("video/add_camera")
    Call<VideoDevice> addCamera(@Body VideoDevice req);

    @PUT("video/{video_id}")
    Call<VideoDevice> updateCamera(@Path("video_id") int videoId, @Body VideoDevice req);

    @DELETE("video/{video_id}")
    Call<Map<String, Object>> deleteCamera(@Path("video_id") int videoId);

    @POST("video/ptz/{video_id}")
    Call<Map<String, Object>> ptzControl(@Path("video_id") int videoId, @Body Map<String, Object> body);

    @POST("video/ptz/{video_id}/start")
    Call<Map<String, Object>> ptzStart(@Path("video_id") int videoId, @Body Map<String, Object> body);

    @POST("video/ptz/{video_id}/stop")
    Call<Map<String, Object>> ptzStop(@Path("video_id") int videoId);

    @POST("video/ai/start")
    Call<Map<String, Object>> startAIMonitor(@Body Map<String, Object> body);

    @POST("video/ai/stop/{device_id}")
    Call<Map<String, Object>> stopAIMonitor(@Path("device_id") String deviceId);

    @GET("video/ai/status")
    Call<Map<String, Object>> getAIStatus();

    @GET("video/{video_id}/recordings")
    Call<List<Map<String, Object>>> getRecordingVideos(@Path("video_id") String videoId);

    @GET("video/{video_id}/playback/videos")
    Call<List<Map<String, Object>>> getNormalPlaybackVideos(@Path("video_id") String videoId);

    @GET("video/{video_id}/alarm/videos")
    Call<List<Map<String, Object>>> getAlarmVideos(@Path("video_id") String videoId);

    @GET("video/recordings/{id}/stream")
    Call<Map<String, Object>> getRecordingStreamUrl(@Path("id") String recordingId);
}
