package com.app.myapplication.data.api;

import com.app.myapplication.data.model.call.AgoraJoinInfo;
import com.app.myapplication.data.model.call.AppVoiceMuteRequest;
import com.app.myapplication.data.model.call.AppVoiceRecord;
import com.app.myapplication.data.model.call.AppVoiceRoom;
import com.app.myapplication.data.model.call.AppVoiceRoomActionRequest;
import com.app.myapplication.data.model.call.AppVoiceRoomCreateRequest;

import java.util.List;
import java.util.Map;

import retrofit2.Call;
import retrofit2.http.Body;
import retrofit2.http.GET;
import retrofit2.http.POST;
import retrofit2.http.Path;
import retrofit2.http.Query;

public interface AppVoiceCallApi {
    @GET("api/personnel/")
    Call<List<Map<String, Object>>> getPersonnel();

    @POST("app/call/voice/rooms")
    Call<AppVoiceRoom> createRoom(@Body AppVoiceRoomCreateRequest body);

    @GET("app/call/voice/rooms")
    Call<List<AppVoiceRoom>> getRooms(
            @Query("user_id") String userId,
            @Query("status") String status,
            @Query("limit") int limit
    );

    @GET("app/call/voice/rooms/{roomId}")
    Call<AppVoiceRoom> getRoom(@Path("roomId") String roomId);

    @POST("app/call/voice/rooms/{roomId}/join")
    Call<AgoraJoinInfo> joinRoom(@Path("roomId") String roomId, @Body AppVoiceRoomActionRequest body);

    @POST("app/call/voice/rooms/{roomId}/leave")
    Call<AppVoiceRoom> leaveRoom(@Path("roomId") String roomId, @Body AppVoiceRoomActionRequest body);

    @POST("app/call/voice/rooms/{roomId}/reject")
    Call<AppVoiceRoom> rejectRoom(@Path("roomId") String roomId, @Body AppVoiceRoomActionRequest body);

    @POST("app/call/voice/rooms/{roomId}/cancel")
    Call<AppVoiceRoom> cancelRoom(@Path("roomId") String roomId, @Body AppVoiceRoomActionRequest body);

    @POST("app/call/voice/rooms/{roomId}/mute")
    Call<AppVoiceRoom> updateMute(@Path("roomId") String roomId, @Body AppVoiceMuteRequest body);

    @GET("app/call/voice/rooms/{roomId}/agora-token")
    Call<AgoraJoinInfo> renewToken(
            @Path("roomId") String roomId,
            @Query("user_id") String userId,
            @Query("client_type") String clientType
    );

    @GET("app/call/voice/records")
    Call<List<AppVoiceRecord>> getRecords(@Query("limit") int limit);
}
