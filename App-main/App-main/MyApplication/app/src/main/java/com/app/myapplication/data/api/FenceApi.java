package com.app.myapplication.data.api;

import com.app.myapplication.data.model.FenceItem;
import com.app.myapplication.data.model.FenceCreateRequest;
import com.app.myapplication.data.model.FenceUpdateRequest;
import com.app.myapplication.data.model.ProjectRegion;
import com.app.myapplication.data.model.SimpleStatusResponse;
import com.app.myapplication.data.model.FenceStats;
import com.app.myapplication.data.model.WorkTeam;

import java.util.List;

import retrofit2.Call;
import retrofit2.http.Body;
import retrofit2.http.DELETE;
import retrofit2.http.GET;
import retrofit2.http.POST;
import retrofit2.http.PUT;
import retrofit2.http.Path;

public interface FenceApi {

    // Regions - 只保留获取列表（后端只有这个）
    @GET("fence/regions")
    Call<List<ProjectRegion>> getRegions();

    // Fences
    @GET("fence/list")
    Call<List<FenceItem>> getFences();

    @POST("fence/")
    Call<FenceItem> createFence(@Body FenceCreateRequest body);

    @PUT("fence/{fence_id}")
    Call<FenceItem> updateFence(@Path("fence_id") String fenceId, @Body FenceUpdateRequest body);

    @DELETE("fence/delete/{fence_id}")
    Call<SimpleStatusResponse> deleteFence(@Path("fence_id") String fenceId);

    // Stats
    @GET("fence/stats")
    Call<FenceStats> getStats();

    // Teams
    @GET("fence/teams")
    Call<List<WorkTeam>> getTeams();
}
