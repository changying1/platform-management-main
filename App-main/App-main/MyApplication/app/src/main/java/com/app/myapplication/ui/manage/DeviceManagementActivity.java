package com.app.myapplication.ui.manage;

import android.os.Bundle;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.EditText;
import android.widget.ImageView;
import android.widget.TextView;
import android.widget.Toast;

import androidx.annotation.NonNull;
import androidx.appcompat.app.AlertDialog;
import androidx.appcompat.app.AppCompatActivity;
import androidx.recyclerview.widget.LinearLayoutManager;
import androidx.recyclerview.widget.RecyclerView;
import androidx.swiperefreshlayout.widget.SwipeRefreshLayout;
import androidx.viewpager2.widget.ViewPager2;

import com.app.myapplication.R;
import com.app.myapplication.data.api.ApiClient;
import com.app.myapplication.data.api.ManagementApi;
import com.app.myapplication.data.api.VideoApi;
import com.app.myapplication.data.model.VideoDevice;
import com.app.myapplication.data.model.manage.LocationDevice;
import com.google.android.material.tabs.TabLayout;
import com.google.android.material.tabs.TabLayoutMediator;

import java.util.ArrayList;
import java.util.List;

import retrofit2.Call;
import retrofit2.Callback;
import retrofit2.Response;

public class DeviceManagementActivity extends AppCompatActivity {

    private TabLayout tabLayout;
    private ViewPager2 viewPager;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_device_management);

        findViewById(R.id.btn_back).setOnClickListener(v -> finish());

        tabLayout = findViewById(R.id.tab_layout);
        viewPager = findViewById(R.id.view_pager);

        DevicePagerAdapter pagerAdapter = new DevicePagerAdapter(this);
        viewPager.setAdapter(pagerAdapter);

        new TabLayoutMediator(tabLayout, viewPager, (tab, position) -> {
            tab.setText(position == 0 ? "摄像头" : "定位装置");
        }).attach();
    }

    // ==================== 摄像头 Fragment ====================
    public static class CameraFragment extends androidx.fragment.app.Fragment {
        private RecyclerView recyclerView;
        private CameraAdapter adapter;
        private List<VideoDevice> cameraList = new ArrayList<>();
        private SwipeRefreshLayout swipeRefresh;
        private EditText etSearch;
        private TextView tvEmpty;

        @Override
        public View onCreateView(@NonNull LayoutInflater inflater, ViewGroup container, Bundle savedInstanceState) {
            View root = inflater.inflate(R.layout.fragment_device_list, container, false);

            etSearch = root.findViewById(R.id.et_search);
            tvEmpty = root.findViewById(R.id.tv_empty);
            swipeRefresh = root.findViewById(R.id.swipe_refresh);
            recyclerView = root.findViewById(R.id.rv_list);
            recyclerView.setLayoutManager(new LinearLayoutManager(requireContext()));
            adapter = new CameraAdapter();
            recyclerView.setAdapter(adapter);

            root.findViewById(R.id.btn_search).setOnClickListener(v -> filterCameras());
            swipeRefresh.setOnRefreshListener(this::loadCameras);

            loadCameras();
            return root;
        }

        private void loadCameras() {
            swipeRefresh.setRefreshing(true);
            ApiClient.get(requireContext()).create(VideoApi.class)
                    .getDevices()
                    .enqueue(new Callback<List<VideoDevice>>() {
                        @Override
                        public void onResponse(Call<List<VideoDevice>> call, Response<List<VideoDevice>> response) {
                            swipeRefresh.setRefreshing(false);
                            if (response.isSuccessful() && response.body() != null) {
                                cameraList = response.body();
                                adapter.setData(cameraList);
                                tvEmpty.setVisibility(cameraList.isEmpty() ? View.VISIBLE : View.GONE);
                            } else {
                                Toast.makeText(requireContext(), "加载失败", Toast.LENGTH_SHORT).show();
                            }
                        }

                        @Override
                        public void onFailure(Call<List<VideoDevice>> call, Throwable t) {
                            swipeRefresh.setRefreshing(false);
                            Toast.makeText(requireContext(), "网络错误: " + t.getMessage(), Toast.LENGTH_SHORT).show();
                        }
                    });
        }

        private void filterCameras() {
            String keyword = etSearch.getText().toString().trim().toLowerCase();
            if (keyword.isEmpty()) {
                adapter.setData(cameraList);
                return;
            }
            List<VideoDevice> filtered = new ArrayList<>();
            for (VideoDevice d : cameraList) {
                String name = d.getName() != null ? d.getName() : "";
                String ip = d.getIpAddress() != null ? d.getIpAddress() : "";
                if (name.toLowerCase().contains(keyword) || ip.contains(keyword)) {
                    filtered.add(d);
                }
            }
            adapter.setData(filtered);
            tvEmpty.setVisibility(filtered.isEmpty() ? View.VISIBLE : View.GONE);
        }

        private void deleteCamera(int cameraId) {
            new AlertDialog.Builder(requireContext())
                    .setTitle("确认删除")
                    .setMessage("确定要删除此摄像头吗？")
                    .setPositiveButton("删除", (dialog, which) -> {
                        ApiClient.get(requireContext()).create(VideoApi.class)
                                .deleteCamera(cameraId)
                                .enqueue(new Callback<java.util.Map<String, Object>>() {
                                    @Override
                                    public void onResponse(Call<java.util.Map<String, Object>> call, Response<java.util.Map<String, Object>> response) {
                                        Toast.makeText(requireContext(), "删除成功", Toast.LENGTH_SHORT).show();
                                        loadCameras();
                                    }

                                    @Override
                                    public void onFailure(Call<java.util.Map<String, Object>> call, Throwable t) {
                                        Toast.makeText(requireContext(), "删除失败", Toast.LENGTH_SHORT).show();
                                    }
                                });
                    })
                    .setNegativeButton("取消", null)
                    .show();
        }

        class CameraAdapter extends RecyclerView.Adapter<CameraAdapter.VH> {
            private List<VideoDevice> data = new ArrayList<>();

            void setData(List<VideoDevice> data) {
                this.data = data;
                notifyDataSetChanged();
            }

            @NonNull
            @Override
            public VH onCreateViewHolder(@NonNull ViewGroup parent, int viewType) {
                View v = LayoutInflater.from(parent.getContext()).inflate(R.layout.item_camera, parent, false);
                return new VH(v);
            }

            @Override
            public void onBindViewHolder(@NonNull VH holder, int position) {
                VideoDevice item = data.get(position);
                holder.tvName.setText(item.getName() != null ? item.getName() : "-");
                holder.tvIp.setText("IP: " + (item.getIpAddress() != null ? item.getIpAddress() : "-"));
                holder.tvPort.setText("端口: " + (item.getPort() != null ? item.getPort() : 80));

                String status = item.getStatus() != null ? item.getStatus() : "offline";
                holder.tvStatus.setText(status.equals("online") ? "在线" : "离线");
                holder.tvStatus.setBackgroundResource(status.equals("online") ? R.drawable.bg_circle_green : R.drawable.bg_circle_gray);

                holder.btnDelete.setOnClickListener(v -> deleteCamera(item.getId()));
            }

            @Override
            public int getItemCount() {
                return data.size();
            }

            class VH extends RecyclerView.ViewHolder {
                TextView tvName, tvIp, tvPort, tvStatus;
                ImageView btnDelete;

                VH(View itemView) {
                    super(itemView);
                    tvName = itemView.findViewById(R.id.tv_name);
                    tvIp = itemView.findViewById(R.id.tv_ip);
                    tvPort = itemView.findViewById(R.id.tv_port);
                    tvStatus = itemView.findViewById(R.id.tv_status);
                    btnDelete = itemView.findViewById(R.id.btn_delete);
                }
            }
        }
    }

    // ==================== 定位装置 Fragment ====================
    public static class LocationDeviceFragment extends androidx.fragment.app.Fragment {
        private RecyclerView recyclerView;
        private LocationAdapter adapter;
        private List<LocationDevice> deviceList = new ArrayList<>();
        private SwipeRefreshLayout swipeRefresh;
        private EditText etSearch;
        private TextView tvEmpty;

        @Override
        public View onCreateView(@NonNull LayoutInflater inflater, ViewGroup container, Bundle savedInstanceState) {
            View root = inflater.inflate(R.layout.fragment_device_list, container, false);

            etSearch = root.findViewById(R.id.et_search);
            tvEmpty = root.findViewById(R.id.tv_empty);
            swipeRefresh = root.findViewById(R.id.swipe_refresh);
            recyclerView = root.findViewById(R.id.rv_list);
            recyclerView.setLayoutManager(new LinearLayoutManager(requireContext()));
            adapter = new LocationAdapter();
            recyclerView.setAdapter(adapter);

            root.findViewById(R.id.btn_search).setOnClickListener(v -> filterDevices());
            swipeRefresh.setOnRefreshListener(this::loadDevices);

            loadDevices();
            return root;
        }

        private void loadDevices() {
            swipeRefresh.setRefreshing(true);
            ApiClient.get(requireContext()).create(ManagementApi.class)
                    .getLocationDevices()
                    .enqueue(new Callback<List<LocationDevice>>() {
                        @Override
                        public void onResponse(Call<List<LocationDevice>> call, Response<List<LocationDevice>> response) {
                            swipeRefresh.setRefreshing(false);
                            if (response.isSuccessful() && response.body() != null) {
                                deviceList = response.body();
                                adapter.setData(deviceList);
                                tvEmpty.setVisibility(deviceList.isEmpty() ? View.VISIBLE : View.GONE);
                            } else {
                                Toast.makeText(requireContext(), "加载失败", Toast.LENGTH_SHORT).show();
                            }
                        }

                        @Override
                        public void onFailure(Call<List<LocationDevice>> call, Throwable t) {
                            swipeRefresh.setRefreshing(false);
                            Toast.makeText(requireContext(), "网络错误: " + t.getMessage(), Toast.LENGTH_SHORT).show();
                        }
                    });
        }

        private void filterDevices() {
            String keyword = etSearch.getText().toString().trim().toLowerCase();
            if (keyword.isEmpty()) {
                adapter.setData(deviceList);
                return;
            }
            List<LocationDevice> filtered = new ArrayList<>();
            for (LocationDevice d : deviceList) {
                String name = d.getName() != null ? d.getName() : "";
                String deviceId = d.getDeviceId() != null ? d.getDeviceId() : "";
                if (name.toLowerCase().contains(keyword) || deviceId.toLowerCase().contains(keyword)) {
                    filtered.add(d);
                }
            }
            adapter.setData(filtered);
            tvEmpty.setVisibility(filtered.isEmpty() ? View.VISIBLE : View.GONE);
        }

        private void deleteDevice(String deviceId) {
            new AlertDialog.Builder(requireContext())
                    .setTitle("确认删除")
                    .setMessage("确定要删除此定位装置吗？")
                    .setPositiveButton("删除", (dialog, which) -> {
                        ApiClient.get(requireContext()).create(ManagementApi.class)
                                .deleteLocationDevice(deviceId)
                                .enqueue(new Callback<java.util.Map<String, Object>>() {
                                    @Override
                                    public void onResponse(Call<java.util.Map<String, Object>> call, Response<java.util.Map<String, Object>> response) {
                                        Toast.makeText(requireContext(), "删除成功", Toast.LENGTH_SHORT).show();
                                        loadDevices();
                                    }

                                    @Override
                                    public void onFailure(Call<java.util.Map<String, Object>> call, Throwable t) {
                                        Toast.makeText(requireContext(), "删除失败", Toast.LENGTH_SHORT).show();
                                    }
                                });
                    })
                    .setNegativeButton("取消", null)
                    .show();
        }

        class LocationAdapter extends RecyclerView.Adapter<LocationAdapter.VH> {
            private List<LocationDevice> data = new ArrayList<>();

            void setData(List<LocationDevice> data) {
                this.data = data;
                notifyDataSetChanged();
            }

            @NonNull
            @Override
            public VH onCreateViewHolder(@NonNull ViewGroup parent, int viewType) {
                View v = LayoutInflater.from(parent.getContext()).inflate(R.layout.item_location_device, parent, false);
                return new VH(v);
            }

            @Override
            public void onBindViewHolder(@NonNull VH holder, int position) {
                LocationDevice item = data.get(position);
                holder.tvName.setText(item.getName() != null ? item.getName() : "-");
                holder.tvDeviceId.setText("设备ID: " + (item.getDeviceId() != null ? item.getDeviceId() : "-"));
                holder.tvType.setText("类型: " + formatType(item.getType()));
                holder.tvHolder.setText("持有人: " + (item.getHolder() != null ? item.getHolder() : "-"));

                String status = item.getStatus() != null ? item.getStatus() : "offline";
                holder.tvStatus.setText(status.equals("online") ? "在线" : status.equals("fault") ? "故障" : "离线");
                int bgRes = status.equals("online") ? R.drawable.bg_circle_green : status.equals("fault") ? R.drawable.bg_circle_red : R.drawable.bg_circle_gray;
                holder.tvStatus.setBackgroundResource(bgRes);

                holder.btnDelete.setOnClickListener(v -> deleteDevice(item.getDeviceId()));
            }

            private String formatType(String type) {
                if (type == null) return "-";
                switch (type) {
                    case "uwb_band": return "UWB手环";
                    case "uwb_badge": return "UWB工牌";
                    case "rtk_band": return "RTK手环";
                    case "rtk_badge": return "RTK工牌";
                    case "wifi": return "Wi-Fi定位";
                    default: return type;
                }
            }

            @Override
            public int getItemCount() {
                return data.size();
            }

            class VH extends RecyclerView.ViewHolder {
                TextView tvName, tvDeviceId, tvType, tvHolder, tvStatus;
                ImageView btnDelete;

                VH(View itemView) {
                    super(itemView);
                    tvName = itemView.findViewById(R.id.tv_name);
                    tvDeviceId = itemView.findViewById(R.id.tv_device_id);
                    tvType = itemView.findViewById(R.id.tv_type);
                    tvHolder = itemView.findViewById(R.id.tv_holder);
                    tvStatus = itemView.findViewById(R.id.tv_status);
                    btnDelete = itemView.findViewById(R.id.btn_delete);
                }
            }
        }
    }

    // ==================== ViewPager Adapter ====================
    static class DevicePagerAdapter extends androidx.viewpager2.adapter.FragmentStateAdapter {

        DevicePagerAdapter(@NonNull AppCompatActivity activity) {
            super(activity);
        }

        @NonNull
        @Override
        public androidx.fragment.app.Fragment createFragment(int position) {
            return position == 0 ? new CameraFragment() : new LocationDeviceFragment();
        }

        @Override
        public int getItemCount() {
            return 2;
        }
    }
}
