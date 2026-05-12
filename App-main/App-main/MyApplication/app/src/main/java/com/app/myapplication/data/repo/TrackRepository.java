package com.app.myapplication.data.repo;

import android.content.Context;

import com.app.myapplication.data.api.ApiClient;
import com.app.myapplication.data.api.TrackApi;
import com.app.myapplication.data.model.TrackPoint;
import com.app.myapplication.data.model.TrackQuery;
import com.app.myapplication.data.model.TrackResponse;

import java.util.ArrayList;
import java.util.List;

import retrofit2.Call;
import retrofit2.Callback;
import retrofit2.Response;

public class TrackRepository {

    public interface RepoCallback<T> {
        void onSuccess(T data);
        void onError(String msg);
    }

    private final TrackApi api;
    private final boolean useMock = true; // TODO: 有后端后改 false

    public TrackRepository(Context ctx) {
        api = ApiClient.get(ctx).create(TrackApi.class);
    }

    public void queryTrack(TrackQuery q, RepoCallback<List<TrackPoint>> cb) {
        if (useMock) {
            cb.onSuccess(mockPoints());
            return;
        }

        // TODO: 后端可用后打开这里
        api.queryTrack(q.keyword, q.startDate, q.endDate).enqueue(new Callback<TrackResponse>() {
            @Override public void onResponse(Call<TrackResponse> call, Response<TrackResponse> response) {
                if (response.isSuccessful() && response.body() != null) {
                    cb.onSuccess(response.body().points);
                } else {
                    cb.onError("响应失败: " + response.code());
                }
            }
            @Override public void onFailure(Call<TrackResponse> call, Throwable t) {
                cb.onError("网络错误: " + t.getMessage());
            }
        });
    }

    private List<TrackPoint> mockPoints() {
        // 仿照前端 demo 的坐标点（上海附近）
        long base = System.currentTimeMillis();
        List<TrackPoint> list = new ArrayList<>();
        list.add(new TrackPoint(31.2304, 121.4737, base));
        list.add(new TrackPoint(31.2314, 121.4747, base + 60_000));
        list.add(new TrackPoint(31.2324, 121.4757, base + 120_000));
        list.add(new TrackPoint(31.2334, 121.4727, base + 180_000));
        list.add(new TrackPoint(31.2354, 121.4787, base + 240_000));
        list.add(new TrackPoint(31.2304, 121.4737, base + 300_000));
        return list;
    }
}
