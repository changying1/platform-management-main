package com.app.myapplication.data.api;

import com.app.myapplication.data.model.CheckStatusRequest;
import com.app.myapplication.data.model.FenceItem;
import com.app.myapplication.data.model.ProjectRegion;
import com.app.myapplication.data.model.SimpleStatusResponse;

import java.util.List;

import retrofit2.Call;
import retrofit2.http.Body;
import retrofit2.http.DELETE;
import retrofit2.http.GET;
import retrofit2.http.POST;
import retrofit2.http.Path;
import retrofit2.http.PUT;
import retrofit2.http.Query;

public interface FenceApi {

    // Regions
    @GET("fence/regions")
    Call<List<ProjectRegion>> getRegions(@Query("skip") int skip, @Query("limit") int limit);

    @POST("fence/regions")
    Call<ProjectRegion> createRegion(@Body ProjectRegion body);

    @DELETE("fence/regions/{region_id}")
    Call<SimpleStatusResponse> deleteRegion(@Path("region_id") int regionId);

    // Fences
    @GET("fence/")
    Call<List<FenceItem>> getFences(@Query("skip") int skip, @Query("limit") int limit);

    @POST("fence/")
    Call<FenceItem> createFence(@Body FenceItem body);

    @PUT("fence/{fence_id}")
    Call<FenceItem> updateFence(@Path("fence_id") int fenceId, @Body FenceItem body);

    @DELETE("fence/{fence_id}")
    Call<SimpleStatusResponse> deleteFence(@Path("fence_id") int fenceId);

    // Check status（你后端现在是 query 参数形式，但你写的是 body；两者选一种）
    @POST("fence/check-status")
    Call<SimpleStatusResponse> checkStatus(@Body CheckStatusRequest body);
}
