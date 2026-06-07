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
import com.app.myapplication.data.model.LocationDevice;
import com.app.myapplication.ui.management.adapter.LocationDeviceAdapter;
import com.google.android.material.floatingactionbutton.FloatingActionButton;
import com.google.gson.JsonObject;

import java.util.ArrayList;
import java.util.List;

import retrofit2.Call;
import retrofit2.Callback;
import retrofit2.Response;

/**
 * 定位装置管理 - 对应 Web 端 LocationDeviceManagement
 * 使用 /device/list 接口获取定位设备数据
 */
public class LocationDeviceListFragment extends BaseManagementFragment {

    private RecyclerView recyclerView;
    private LocationDeviceAdapter adapter;
    private TextView tvEmpty;
    private TextView tvCount;
    private FloatingActionButton fabAdd;
    private List<LocationDevice> devices = new ArrayList<>();

    @Nullable
    @Override
    public View onCreateView(@NonNull LayoutInflater inflater, @Nullable ViewGroup container, @Nullable Bundle savedInstanceState) {
        View view = inflater.inflate(R.layout.fragment_location_device_list, container, false);
        
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
        adapter = new LocationDeviceAdapter(devices);
        recyclerView.setAdapter(adapter);
    }

    private void loadData() {
        showLoading();
        
        // 调用 /device/list 接口获取定位设备列表 - 与 Web 端 deviceApi.getLocationDevices() 对齐
        managementApi.getLocationDevices(getAuthHeaders()).enqueue(new Callback<List<JsonObject>>() {
            @Override
            public void onResponse(Call<List<JsonObject>> call, Response<List<JsonObject>> response) {
                hideLoading();
                devices.clear();
                
                if (response.isSuccessful() && response.body() != null) {
                    List<JsonObject> apiData = response.body();
                    android.util.Log.d("LocationDevice", "API returned " + apiData.size() + " devices");
                    
                    for (JsonObject device : apiData) {
                        LocationDevice locationDevice = parseLocationDevice(device);
                        if (locationDevice != null) {
                            devices.add(locationDevice);
                        }
                    }
                } else {
                    android.util.Log.e("LocationDevice", "API error: " + response.code());
                }
                
                adapter.notifyDataSetChanged();
                updateUI();
            }

            @Override
            public void onFailure(Call<List<JsonObject>> call, Throwable t) {
                hideLoading();
                android.util.Log.e("LocationDevice", "API failure: " + t.getMessage());
                devices.clear();
                adapter.notifyDataSetChanged();
                updateUI();
                showToast("网络错误: " + t.getMessage());
            }
        });
    }

    /**
     * 解析定位设备数据 - 与 Web 端 LocationDevice 类型对齐
     */
    private LocationDevice parseLocationDevice(JsonObject d) {
        try {
            // device_id - 对应 Web 端 device.device_id
            String id = "";
            if (d.has("device_id")) {
                id = d.get("device_id").getAsString();
            } else if (d.has("id")) {
                id = d.get("id").getAsString();
            }
            
            // name - 对应 Web 端 device.name
            String name = d.has("name") ? d.get("name").getAsString() : "未知设备";
            
            // type - 对应 Web 端 device.type
            String type = d.has("type") ? d.get("type").getAsString() : "uwb_band";
            
            // status - 对应 Web 端 device.status (online/offline/fault)
            String status = "离线";
            if (d.has("status")) {
                String s = d.get("status").getAsString();
                if ("online".equals(s)) status = "在线";
                else if ("fault".equals(s)) status = "故障";
                else status = "离线";
            }
            
            // company - 对应 Web 端 device.company
            String company = "";
            if (d.has("company") && !d.get("company").isJsonNull()) {
                company = d.get("company").getAsString();
            }
            
            android.util.Log.d("LocationDevice", "Parsed: " + name + " type=" + type + " status=" + status);
            return new LocationDevice(id, name, type, status, company);
        } catch (Exception e) {
            android.util.Log.e("LocationDevice", "Parse error: " + e.getMessage());
            return null;
        }
    }

    private void updateUI() {
        tvCount.setText(String.format("共 %d 个定位装置", devices.size()));
        if (devices.isEmpty()) {
            tvEmpty.setVisibility(View.VISIBLE);
            recyclerView.setVisibility(View.GONE);
            tvEmpty.setText("暂无定位装置数据");
        } else {
            tvEmpty.setVisibility(View.GONE);
            recyclerView.setVisibility(View.VISIBLE);
        }
    }

    private void showAddDialog() {
        showToast("添加定位装置功能开发中");
    }
}
