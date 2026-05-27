package com.app.myapplication.data.repo;

import android.content.Context;

import com.app.myapplication.data.api.ApiClient;
import com.app.myapplication.data.api.TrackApi;
import com.app.myapplication.data.model.TrackPoint;

import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.List;
import java.util.Locale;

public class TrackRepository {

    public interface RepoCallback<T> {
        void onSuccess(T data);
        void onError(String msg);
    }

    private final TrackApi api;
    private final boolean useMock = true;

    public TrackRepository(Context ctx) {
        api = ApiClient.get(ctx).create(TrackApi.class);
    }

    public void queryTrack(String deviceId, int hours, RepoCallback<List<TrackPoint>> cb) {
        if (useMock) {
            cb.onSuccess(mockPoints());
            return;
        }

        api.getDeviceTrajectory(deviceId, hours).enqueue(new retrofit2.Callback<com.app.myapplication.data.model.TrackDevice>() {
            @Override
            public void onResponse(retrofit2.Call<com.app.myapplication.data.model.TrackDevice> call,
                                   retrofit2.Response<com.app.myapplication.data.model.TrackDevice> response) {
                if (response.isSuccessful() && response.body() != null) {
                    List<TrackPoint> points = convertToTrackPoints(response.body().getTrajectory());
                    cb.onSuccess(points);
                } else {
                    cb.onError("响应失败: " + response.code());
                }
            }

            @Override
            public void onFailure(retrofit2.Call<com.app.myapplication.data.model.TrackDevice> call, Throwable t) {
                cb.onError("网络错误: " + t.getMessage());
            }
        });
    }

    private List<TrackPoint> convertToTrackPoints(List<com.app.myapplication.data.model.TrajectoryPoint> trajectory) {
        List<TrackPoint> points = new ArrayList<>();
        if (trajectory == null) return points;

        for (com.app.myapplication.data.model.TrajectoryPoint tp : trajectory) {
            points.add(new TrackPoint(tp.getLat(), tp.getLng(), tp.getTimestamp(), tp.getSpeed()));
        }
        return points;
    }

    private List<TrackPoint> mockPoints() {
        SimpleDateFormat sdf = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss", Locale.getDefault());
        Date base = new Date();
        List<TrackPoint> list = new ArrayList<>();
        list.add(new TrackPoint(31.2304, 121.4737, sdf.format(base), 2.5));
        list.add(new TrackPoint(31.2314, 121.4747, sdf.format(new Date(base.getTime() + 60_000)), 3.0));
        list.add(new TrackPoint(31.2324, 121.4757, sdf.format(new Date(base.getTime() + 120_000)), 2.8));
        list.add(new TrackPoint(31.2334, 121.4727, sdf.format(new Date(base.getTime() + 180_000)), 3.2));
        list.add(new TrackPoint(31.2354, 121.4787, sdf.format(new Date(base.getTime() + 240_000)), 2.6));
        list.add(new TrackPoint(31.2304, 121.4737, sdf.format(new Date(base.getTime() + 300_000)), 2.9));
        return list;
    }
}
