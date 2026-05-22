package com.app.myapplication.data.api;

import com.app.myapplication.data.model.VideoDevice;
import com.app.myapplication.data.model.LiveStreamInfo;

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

public interface VideoApi {

    @GET("video/")
    Call<List<VideoDevice>> getDevices();

    @GET("video/stream/{video_id}")
    Call<LiveStreamInfo> getLiveStream(@Path("video_id") String videoId);

    @GET("video/stream/{video_id}")
    Call<LiveStreamInfo> getLiveStream(@Path("video_id") String videoId, @Query("protocol") String protocol);

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

    @POST("video/zoom/{video_id}/start")
    Call<Map<String, Object>> zoomStart(@Path("video_id") int videoId, @Body Map<String, Object> body);

    @POST("video/zoom/{video_id}/stop")
    Call<Map<String, Object>> zoomStop(@Path("video_id") int videoId);

    @GET("video/ptz/{video_id}/presets")
    Call<List<Map<String, Object>>> getPresets(@Path("video_id") int videoId);

    @POST("video/ptz/{video_id}/presets")
    Call<Map<String, Object>> createPreset(@Path("video_id") int videoId, @Body Map<String, Object> body);

    @POST("video/ptz/{video_id}/presets/{preset_token}/goto")
    Call<Map<String, Object>> gotoPreset(@Path("video_id") int videoId, @Path("preset_token") String presetToken, @Body Map<String, Object> body);

    @DELETE("video/ptz/{video_id}/presets/{preset_token}")
    Call<Map<String, Object>> deletePreset(@Path("video_id") int videoId, @Path("preset_token") String presetToken);

    @POST("video/ptz/{video_id}/presets/bulk-delete")
    Call<Map<String, Object>> bulkDeletePresets(@Path("video_id") int videoId, @Body Map<String, Object> body);

    @POST("video/ptz/{video_id}/cruise/start")
    Call<Map<String, Object>> cruiseStart(@Path("video_id") int videoId, @Body Map<String, Object> body);

    @POST("video/ptz/{video_id}/cruise/stop")
    Call<Map<String, Object>> cruiseStop(@Path("video_id") int videoId);

    @GET("video/ptz/{video_id}/cruise/status")
    Call<Map<String, Object>> cruiseStatus(@Path("video_id") int videoId);

    @POST("video/ptz/{video_id}/cruise/start-current")
    Call<Map<String, Object>> cruiseStartCurrent(@Path("video_id") int videoId);

    @PUT("video/ptz/{video_id}/cruise/current")
    Call<Map<String, Object>> cruiseSaveCurrent(@Path("video_id") int videoId, @Body Map<String, Object> body);

    @GET("video/ptz/{video_id}/cruise/current")
    Call<Map<String, Object>> cruiseGetCurrent(@Path("video_id") int videoId);

    @POST("video/ai/start")
    Call<Map<String, Object>> startAIMonitor(@Body Map<String, Object> body);

    @POST("video/ai/stop")
    Call<Map<String, Object>> stopAIMonitor(@Query("device_id") String deviceId);

    @GET("video/ai/status")
    Call<Map<String, Object>> getAIStatus();

    @GET("video/{video_id}/recordings")
    Call<List<Map<String, Object>>> getRecordingVideos(@Path("video_id") String videoId, @Query("limit") int limit);

    @GET("video/{video_id}/playback/videos")
    Call<List<Map<String, Object>>> getNormalPlaybackVideos(@Path("video_id") String videoId, @Query("limit") int limit);

    @GET("video/{video_id}/alarm/videos")
    Call<List<Map<String, Object>>> getAlarmVideos(@Path("video_id") String videoId, @Query("limit") int limit);
}
