package com.app.myapplication.ui.fence;

import android.app.Application;

import androidx.annotation.NonNull;
import androidx.lifecycle.AndroidViewModel;
import androidx.lifecycle.LiveData;
import androidx.lifecycle.MutableLiveData;

import com.app.myapplication.data.model.FenceCreateRequest;
import com.app.myapplication.data.model.FenceItem;
import com.app.myapplication.data.model.ProjectRegion;
import com.app.myapplication.data.repo.FenceRepository;
import com.app.myapplication.data.model.SimpleStatusResponse;
import com.google.gson.Gson;

import java.util.Collections;
import java.util.List;

/**
 * 围栏中心ViewModel - 对齐后端新接口
 */
public class FenceCenterViewModel extends AndroidViewModel {

    private final FenceRepository repo;
    private final Gson gson = new Gson();

    private final MutableLiveData<List<FenceItem>> fences = new MutableLiveData<>(Collections.emptyList());
    private final MutableLiveData<List<ProjectRegion>> regions = new MutableLiveData<>(Collections.emptyList());
    private final MutableLiveData<String> error = new MutableLiveData<>();

    public FenceCenterViewModel(@NonNull Application app) {
        super(app);
        repo = new FenceRepository(app.getApplicationContext());
    }

    public LiveData<List<FenceItem>> fences() { return fences; }
    public LiveData<List<ProjectRegion>> regions() { return regions; }
    public LiveData<String> error() { return error; }

    public void refreshAll() {
        repo.loadFences(new FenceRepository.DataCallback<List<FenceItem>>() {
            @Override public void onSuccess(List<FenceItem> data) { fences.postValue(data); }
            @Override public void onError(String msg) { error.postValue(msg); }
        });

        repo.loadRegions(new FenceRepository.DataCallback<List<ProjectRegion>>() {
            @Override public void onSuccess(List<ProjectRegion> data) { regions.postValue(data); }
            @Override public void onError(String msg) { error.postValue(msg); }
        });
    }

    // 创建围栏 - 将 FenceItem 转换为 FenceCreateRequest
    public void createFence(FenceItem fence) {
        FenceCreateRequest request = convertToCreateRequest(fence);
        repo.createFence(request, new FenceRepository.DataCallback<FenceItem>() {
            @Override public void onSuccess(FenceItem data) { refreshAll(); }
            @Override public void onError(String msg) { error.postValue(msg); }
        });
    }

    // 删除围栏 - ID改为String类型
    public void deleteFence(String fenceId) {
        repo.deleteFence(fenceId, new FenceRepository.DataCallback<SimpleStatusResponse>() {
            @Override public void onSuccess(SimpleStatusResponse ok) { refreshAll(); }
            @Override public void onError(String msg) { error.postValue(msg); }
        });
    }

    // FenceItem 转换为 FenceCreateRequest - 对齐后端 POST /fence/ 格式
    private FenceCreateRequest convertToCreateRequest(FenceItem f) {
        FenceCreateRequest req = new FenceCreateRequest();
        req.name = f.name != null ? f.name : "未命名围栏";
        req.project_region_id = null;  // 默认为null
        req.shape = f.shape != null ? f.shape : "circle";
        req.behavior = f.behavior != null ? f.behavior : "No Entry";
        req.effective_time = (f.schedule != null && f.schedule.start != null && f.schedule.end != null) 
            ? f.schedule.start + "-" + f.schedule.end 
            : "00:00-23:59";
        req.remark = "";
        
        // severity 映射到 alarm_type
        String sev = f.severity != null ? f.severity : "normal";
        if ("risk".equalsIgnoreCase(sev)) req.alarm_type = "medium";
        else if ("severe".equalsIgnoreCase(sev)) req.alarm_type = "high";
        else req.alarm_type = "low";
        
        // 构建 coordinates_json
        if ("circle".equalsIgnoreCase(req.shape) && f.center != null && f.center.size() >= 2) {
            // 圆形：中心点
            double[][] coords = new double[][]{{f.center.get(0), f.center.get(1)}};
            req.coordinates_json = gson.toJson(coords);
            req.radius = f.radius != null ? f.radius : 50.0;
        } else if ("polygon".equalsIgnoreCase(req.shape) && f.points != null && !f.points.isEmpty()) {
            // 多边形：点数组
            double[][] coords = new double[f.points.size()][2];
            for (int i = 0; i < f.points.size(); i++) {
                List<Double> p = f.points.get(i);
                if (p != null && p.size() >= 2) {
                    coords[i][0] = p.get(0);
                    coords[i][1] = p.get(1);
                }
            }
            req.coordinates_json = gson.toJson(coords);
            req.radius = null;
        } else {
            req.coordinates_json = "[]";
            req.radius = f.radius != null ? f.radius : 50.0;
        }
        
        return req;
    }
}
