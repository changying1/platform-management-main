package com.app.myapplication.data.repo;

import android.content.Context;

import androidx.annotation.NonNull;

import com.app.myapplication.data.api.ApiClient;
import com.app.myapplication.data.api.FenceApi;
import com.app.myapplication.data.model.CheckStatusRequest;
import com.app.myapplication.data.model.FenceItem;
import com.app.myapplication.data.model.ProjectRegion;
import com.app.myapplication.data.model.SimpleStatusResponse;

import java.util.List;

import retrofit2.Call;
import retrofit2.Callback;
import retrofit2.Response;

public class FenceRepository {

    private final FenceApi api;

    public FenceRepository(Context ctx) {
        api = ApiClient.get(ctx.getApplicationContext()).create(FenceApi.class);
    }

    public interface DataCallback<T> {
        void onSuccess(T data);
        void onError(String msg);
    }

    // -------------------------
    // Regions
    // -------------------------
    public void loadRegions(DataCallback<List<ProjectRegion>> cb) {
        api.getRegions(0, 200).enqueue(wrap(cb));
    }

    public void getRegions(int skip, int limit, DataCallback<List<ProjectRegion>> cb) {
        api.getRegions(skip, limit).enqueue(wrap(cb));
    }

    public void createRegion(ProjectRegion region, DataCallback<ProjectRegion> cb) {
        api.createRegion(region).enqueue(wrap(cb));
    }

    public void deleteRegion(int id, DataCallback<SimpleStatusResponse> cb) {
        api.deleteRegion(id).enqueue(wrap(cb));
    }

    // -------------------------
    // Fences
    // -------------------------
    public void loadFences(DataCallback<List<FenceItem>> cb) {
        api.getFences(0, 200).enqueue(wrap(cb));
    }

    public void getFences(int skip, int limit, DataCallback<List<FenceItem>> cb) {
        api.getFences(skip, limit).enqueue(wrap(cb));
    }

    public void createFence(FenceItem fence, DataCallback<FenceItem> cb) {
        api.createFence(fence).enqueue(wrap(cb));
    }

    public void updateFence(int id, FenceItem fence, DataCallback<FenceItem> cb) {
        api.updateFence(id, fence).enqueue(wrap(cb));
    }

    public void deleteFence(int id, DataCallback<SimpleStatusResponse> cb) {
        api.deleteFence(id).enqueue(wrap(cb));
    }

    // -------------------------
    // Status check
    // -------------------------
    public void checkStatus(String deviceId, double lat, double lng, DataCallback<SimpleStatusResponse> cb) {
        api.checkStatus(new CheckStatusRequest(deviceId, lat, lng)).enqueue(wrap(cb));
    }

    // -------------------------
    // callback wrapper
    // -------------------------
    private static <T> Callback<T> wrap(DataCallback<T> cb) {
        return new Callback<T>() {
            @Override
            public void onResponse(@NonNull Call<T> call, @NonNull Response<T> response) {
                if (response.isSuccessful()) {
                    cb.onSuccess(response.body());
                } else {
                    cb.onError("HTTP " + response.code());
                }
            }

            @Override
            public void onFailure(@NonNull Call<T> call, @NonNull Throwable t) {
                cb.onError(t == null ? "unknown error" : String.valueOf(t.getMessage()));
            }
        };
    }
}
