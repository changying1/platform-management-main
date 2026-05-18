package com.app.myapplication.data.repo;

import android.content.Context;

import com.app.myapplication.data.api.ApiClient;
import com.app.myapplication.data.api.VideoApi;
import com.app.myapplication.data.model.VideoDevice;

import java.util.Collections;
import java.util.List;
import java.util.Map;

import retrofit2.Call;
import retrofit2.Callback;
import retrofit2.Response;

public class VideoRepository {

    public interface Result<T> {
        void onOk(T data);
        void onErr(String msg);
    }

    private final Context ctx;

    public VideoRepository(Context ctx) {
        this.ctx = ctx.getApplicationContext();
    }

    private VideoApi api() {
        return ApiClient.get(ctx).create(VideoApi.class);
    }

    /** GET /video/ */
    public void getDevices(Result<List<VideoDevice>> cb) {
        api().getDevices().enqueue(new Callback<List<VideoDevice>>() {
            @Override
            public void onResponse(Call<List<VideoDevice>> call, Response<List<VideoDevice>> response) {
                if (!response.isSuccessful()) {
                    cb.onErr("获取设备失败：HTTP " + response.code());
                    return;
                }
                List<VideoDevice> body = response.body();
                if (body == null) body = Collections.emptyList();
                cb.onOk(body);
            }

            @Override
            public void onFailure(Call<List<VideoDevice>> call, Throwable t) {
                cb.onErr("获取设备失败：" + (t == null ? "unknown" : t.getMessage()));
            }
        });
    }

    /** POST /video/add_camera */
    public void addCamera(VideoDevice req, Result<VideoDevice> cb) {
        api().addCamera(req).enqueue(new Callback<VideoDevice>() {
            @Override
            public void onResponse(Call<VideoDevice> call, Response<VideoDevice> resp) {
                if (resp.isSuccessful() && resp.body() != null) {
                    cb.onOk(resp.body());
                    return;
                }

                String err = "";
                try {
                    if (resp.errorBody() != null) err = resp.errorBody().string();
                } catch (Exception ignored) {}

                cb.onErr("新增失败：HTTP " + resp.code() + "\n" + err);
            }

            @Override
            public void onFailure(Call<VideoDevice> call, Throwable t) {
                cb.onErr("网络错误：" + (t == null ? "unknown" : t.getMessage()));
            }
        });
    }

    /** ✅ PUT /video/{video_id} */
    public void updateCamera(int videoId, VideoDevice req, Result<VideoDevice> cb) {
        api().updateCamera(videoId, req).enqueue(new Callback<VideoDevice>() {
            @Override
            public void onResponse(Call<VideoDevice> call, Response<VideoDevice> resp) {
                if (resp.isSuccessful() && resp.body() != null) {
                    cb.onOk(resp.body());
                    return;
                }

                String err = "";
                try {
                    if (resp.errorBody() != null) err = resp.errorBody().string();
                } catch (Exception ignored) {}

                cb.onErr("修改失败：HTTP " + resp.code() + "\n" + err);
            }

            @Override
            public void onFailure(Call<VideoDevice> call, Throwable t) {
                cb.onErr("网络错误：" + (t == null ? "unknown" : t.getMessage()));
            }
        });
    }

    /** ✅ DELETE /video/{video_id} */
    public void deleteCamera(int videoId, Result<Map<String, Object>> cb) {
        api().deleteCamera(videoId).enqueue(new Callback<Map<String, Object>>() {
            @Override
            public void onResponse(Call<Map<String, Object>> call, Response<Map<String, Object>> resp) {
                if (resp.isSuccessful()) {
                    cb.onOk(resp.body());
                    return;
                }

                String err = "";
                try {
                    if (resp.errorBody() != null) err = resp.errorBody().string();
                } catch (Exception ignored) {}

                cb.onErr("删除失败：HTTP " + resp.code() + "\n" + err);
            }

            @Override
            public void onFailure(Call<Map<String, Object>> call, Throwable t) {
                cb.onErr("网络错误：" + (t == null ? "unknown" : t.getMessage()));
            }
        });
    }
}
