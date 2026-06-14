package com.app.myapplication.ui.management.fragment;

import android.os.Bundle;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.TextView;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.recyclerview.widget.LinearLayoutManager;
import androidx.recyclerview.widget.RecyclerView;

import com.app.myapplication.R;
import com.app.myapplication.data.model.CameraDevice;
import com.app.myapplication.ui.management.adapter.CameraAdapter;
import com.google.android.material.floatingactionbutton.FloatingActionButton;
import com.google.gson.JsonObject;

import java.util.ArrayList;
import java.util.List;

import retrofit2.Call;
import retrofit2.Callback;
import retrofit2.Response;

/**
 * 摄像头列表 - 对应 Web 端 CameraManagement
 * 使用 /video/ 接口获取摄像头数据
 */
public class CameraListFragment extends BaseManagementFragment {

    private RecyclerView recyclerView;
    private CameraAdapter adapter;
    private TextView tvEmpty;
    private TextView tvCount;
    private FloatingActionButton fabAdd;
    private List<CameraDevice> cameras = new ArrayList<>();

    @Nullable
    @Override
    public View onCreateView(@NonNull LayoutInflater inflater, @Nullable ViewGroup container, @Nullable Bundle savedInstanceState) {
        View view = inflater.inflate(R.layout.fragment_camera_list, container, false);
        
        initViews(view);
        setupRecyclerView();
        loadData();
        
        return view;
    }

    private void initViews(View view) {
        recyclerView = view.findViewById(R.id.recycler_view);
        tvEmpty = view.findViewById(R.id.tv_empty);
        tvCount = view.findViewById(R.id.tv_count);
        fabAdd = view.findViewById(R.id.fab_add);
        
        if (hasPermission("device.create")) {
            fabAdd.setOnClickListener(v -> showAddDialog());
        } else {
            fabAdd.hide();
        }
        
        setupSwipeRefresh(view, R.id.swipe_refresh, this::loadData);
    }

    private void setupRecyclerView() {
        recyclerView.setLayoutManager(new LinearLayoutManager(requireContext()));
        adapter = new CameraAdapter(cameras);
        recyclerView.setAdapter(adapter);
    }

    private void loadData() {
        showLoading();
        
        // 调用 /video/ 接口获取摄像头列表 - 与 Web 端 getAllVideos() 对齐
        managementApi.getVideos(getAuthHeaders()).enqueue(new Callback<List<JsonObject>>() {
            @Override
            public void onResponse(Call<List<JsonObject>> call, Response<List<JsonObject>> response) {
                hideLoading();
                cameras.clear();
                
                if (response.isSuccessful() && response.body() != null) {
                    List<JsonObject> apiData = response.body();
                    android.util.Log.d("CameraList", "API returned " + apiData.size() + " videos");
                    
                    for (JsonObject video : apiData) {
                        CameraDevice camera = mapVideoToCamera(video);
                        if (camera != null) {
                            cameras.add(camera);
                        }
                    }
                } else {
                    android.util.Log.e("CameraList", "API error: " + response.code());
                }
                
                adapter.notifyDataSetChanged();
                updateUI();
            }

            @Override
            public void onFailure(Call<List<JsonObject>> call, Throwable t) {
                hideLoading();
                android.util.Log.e("CameraList", "API failure: " + t.getMessage());
                cameras.clear();
                adapter.notifyDataSetChanged();
                updateUI();
                showToast("网络错误: " + t.getMessage());
            }
        });
    }

    /**
     * 与 Web 端 mapVideoToCamera 对齐
     */
    private CameraDevice mapVideoToCamera(JsonObject video) {
        try {
            String id = video.has("id") ? video.get("id").getAsString() : "";
            String name = video.has("name") ? video.get("name").getAsString() : "未知设备";
            
            // 平台类型
            String platform = "";
            if (video.has("platform_type")) {
                platform = video.get("platform_type").getAsString();
            } else if (video.has("stream_protocol")) {
                platform = video.get("stream_protocol").getAsString();
            }
            
            // 状态
            String status = "离线";
            if (video.has("status")) {
                String s = video.get("status").getAsString();
                status = "online".equals(s) ? "在线" : "离线";
            }
            
            // 所属项目
            String project = "";
            if (video.has("project") && !video.get("project").isJsonNull()) {
                project = video.get("project").getAsString();
            } else if (video.has("company") && !video.get("company").isJsonNull()) {
                project = video.get("company").getAsString();
            }
            
            android.util.Log.d("CameraList", "Mapped: " + name + " (" + platform + ")");
            return new CameraDevice(id, name, platform, status, project);
        } catch (Exception e) {
            android.util.Log.e("CameraList", "Map error: " + e.getMessage());
            return null;
        }
    }

    private void updateUI() {
        tvCount.setText(String.format("共 %d 个摄像头", cameras.size()));
        if (cameras.isEmpty()) {
            tvEmpty.setVisibility(View.VISIBLE);
            recyclerView.setVisibility(View.GONE);
            tvEmpty.setText("暂无摄像头数据");
        } else {
            tvEmpty.setVisibility(View.GONE);
            recyclerView.setVisibility(View.VISIBLE);
        }
    }

    private void showAddDialog() {
        showToast("添加摄像头功能开发中");
    }
}
