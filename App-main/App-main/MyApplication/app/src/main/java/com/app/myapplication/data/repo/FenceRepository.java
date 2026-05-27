package com.app.myapplication.data.repo;

import android.content.Context;

import androidx.annotation.NonNull;

import com.app.myapplication.data.api.ApiClient;
import com.app.myapplication.data.api.FenceApi;
import com.app.myapplication.data.model.FenceCreateRequest;
import com.app.myapplication.data.model.FenceItem;
import com.app.myapplication.data.model.FenceStats;
import com.app.myapplication.data.model.FenceUpdateRequest;
import com.app.myapplication.data.model.ProjectRegion;
import com.app.myapplication.data.model.SimpleStatusResponse;
import com.app.myapplication.data.model.WorkTeam;

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
    // Regions - 只保留获取列表
    // -------------------------
    public void loadRegions(DataCallback<List<ProjectRegion>> cb) {
        api.getRegions().enqueue(wrap(cb));
    }

    // -------------------------
    // Fences
    // -------------------------
    public void loadFences(DataCallback<List<FenceItem>> cb) {
        api.getFences().enqueue(wrap(cb));
    }

    public void createFence(FenceCreateRequest request, DataCallback<FenceItem> cb) {
        api.createFence(request).enqueue(wrap(cb));
    }

    public void updateFence(String id, FenceUpdateRequest request, DataCallback<FenceItem> cb) {
        api.updateFence(id, request).enqueue(wrap(cb));
    }

    public void deleteFence(String id, DataCallback<SimpleStatusResponse> cb) {
        api.deleteFence(id).enqueue(wrap(cb));
    }

    // -------------------------
    // Stats
    // -------------------------
    public void getStats(DataCallback<FenceStats> cb) {
        api.getStats().enqueue(wrap(cb));
    }

    // -------------------------
    // Teams
    // -------------------------
    public void getTeams(DataCallback<List<WorkTeam>> cb) {
        api.getTeams().enqueue(wrap(cb));
    }

    // -------------------------
    // callback wrapper
    // -------------------------
    private static <T> Callback<T> wrap(DataCallback<T> cb) {
        return new Callback<T>() {
            @Override
            public void onResponse(@NonNull Call<T> call, @NonNull Response<T> response) {
                if (response.isSuccessful() && response.body() != null) {
                    cb.onSuccess(response.body());
                } else if (response.isSuccessful()) {
                    cb.onError("Empty response body");
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
