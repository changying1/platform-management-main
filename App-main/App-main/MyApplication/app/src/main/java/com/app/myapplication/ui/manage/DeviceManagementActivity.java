package com.app.myapplication.ui.manage;

import android.Manifest;
import android.content.Context;
import android.content.pm.PackageManager;
import android.os.Bundle;
import android.text.TextUtils;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.ArrayAdapter;
import android.widget.Button;
import android.widget.EditText;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.Spinner;
import android.widget.TextView;
import android.widget.Toast;

import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.annotation.NonNull;
import androidx.appcompat.app.AlertDialog;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.content.ContextCompat;
import androidx.recyclerview.widget.LinearLayoutManager;
import androidx.recyclerview.widget.RecyclerView;
import androidx.swiperefreshlayout.widget.SwipeRefreshLayout;
import androidx.viewpager2.widget.ViewPager2;

import com.app.myapplication.R;
import com.app.myapplication.data.api.ApiClient;
import com.app.myapplication.data.api.CameraRegistrationApi;
import com.app.myapplication.data.api.ManagementApi;
import com.app.myapplication.data.api.VideoApi;
import com.app.myapplication.data.local.SessionManager;
import com.app.myapplication.data.model.VideoDevice;
import com.app.myapplication.data.model.manage.LocationDevice;
import com.app.myapplication.ui.scan.QrScanOptions;
import com.google.android.material.tabs.TabLayout;
import com.google.android.material.tabs.TabLayoutMediator;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import com.journeyapps.barcodescanner.ScanContract;
import com.journeyapps.barcodescanner.ScanOptions;

import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

import retrofit2.Call;
import retrofit2.Callback;
import retrofit2.Response;

public class DeviceManagementActivity extends AppCompatActivity {
    private static final String[] CAMERA_PLATFORM_LABELS = {"自定义", "海康威视", "大华", "通用协议"};
    private static final String[] CAMERA_PLATFORM_VALUES = {"custom", "hikvision", "dahua", "onvif"};
    private static final String[] CAMERA_TYPE_LABELS = {"摄像头", "球机", "枪机"};
    private static final String[] CAMERA_TYPE_VALUES = {"camera", "ptz", "bullet"};
    private static final String[] LOCATION_TYPE_LABELS = {"定位终端", "超宽带手环", "超宽带工牌", "高精度手环", "高精度工牌", "无线定位"};
    private static final String[] LOCATION_TYPE_VALUES = {"jt808", "uwb_band", "uwb_badge", "rtk_band", "rtk_badge", "wifi"};

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_device_management);

        findViewById(R.id.btn_back).setOnClickListener(v -> finish());
        ViewPager2 viewPager = findViewById(R.id.view_pager);
        TabLayout tabLayout = findViewById(R.id.tab_layout);
        viewPager.setAdapter(new DevicePagerAdapter(this));
        new TabLayoutMediator(tabLayout, viewPager, (tab, position) ->
                tab.setText(position == 0 ? "摄像头" : "定位装置")).attach();
    }

    public static class CameraFragment extends androidx.fragment.app.Fragment {
        private RecyclerView recyclerView;
        private CameraAdapter adapter;
        private List<VideoDevice> cameraList = new ArrayList<>();
        private SwipeRefreshLayout swipeRefresh;
        private EditText etSearch;
        private TextView tvEmpty;
        private OrgNode selectedFilterOrg;
        private final List<OrgNode> selectableOrgTreeNodes = new ArrayList<>();
        private CameraForm activeScanForm;

        private final ActivityResultLauncher<ScanOptions> scanLauncher =
                registerForActivityResult(new ScanContract(), result -> {
                    if (result != null && !TextUtils.isEmpty(result.getContents()) && activeScanForm != null) {
                        applyCameraScanResult(activeScanForm, result.getContents());
                    }
                });

        private final ActivityResultLauncher<String> cameraPermissionLauncher =
                registerForActivityResult(new ActivityResultContracts.RequestPermission(), granted -> {
                    if (granted) {
                        launchScanner();
                    } else {
                        Toast.makeText(requireContext(), "需要相机权限才能扫码", Toast.LENGTH_SHORT).show();
                    }
                });

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

            root.findViewById(R.id.btn_search).setOnClickListener(v -> applyCameraFilters());
            root.findViewById(R.id.fab_add).setOnClickListener(v -> showAddModeDialog());
            TextView orgFilter = root.findViewById(R.id.btn_org_filter);
            TextView clearOrg = root.findViewById(R.id.btn_clear_org_filter);
            orgFilter.setText("单位筛选：全部");
            orgFilter.setOnClickListener(v -> showOrgTreePicker("按单位筛选", selectedFilterOrg, org -> {
                selectedFilterOrg = org;
                orgFilter.setText("单位筛选：" + org.path);
                applyCameraFilters();
            }));
            clearOrg.setText("清除筛选");
            clearOrg.setOnClickListener(v -> {
                selectedFilterOrg = null;
                orgFilter.setText("单位筛选：全部");
                applyCameraFilters();
            });
            swipeRefresh.setOnRefreshListener(this::loadCameras);

            loadCameras();
            loadSelectableOrgTree(this, selectableOrgTreeNodes);
            return root;
        }

        private void loadCameras() {
            swipeRefresh.setRefreshing(true);
            ApiClient.get(requireContext()).create(VideoApi.class)
                    .getDevices(500)
                    .enqueue(new Callback<List<VideoDevice>>() {
                        @Override
                        public void onResponse(Call<List<VideoDevice>> call, Response<List<VideoDevice>> response) {
                            swipeRefresh.setRefreshing(false);
                            if (response.isSuccessful() && response.body() != null) {
                                cameraList = response.body();
                                applyCameraFilters();
                            } else {
                                Toast.makeText(requireContext(), "加载失败", Toast.LENGTH_SHORT).show();
                            }
                        }

                        @Override
                        public void onFailure(Call<List<VideoDevice>> call, Throwable t) {
                            swipeRefresh.setRefreshing(false);
                            Toast.makeText(requireContext(), "网络错误：" + t.getMessage(), Toast.LENGTH_SHORT).show();
                        }
                    });
        }

        private void applyCameraFilters() {
            String keyword = etSearch.getText().toString().trim().toLowerCase(Locale.ROOT);
            List<VideoDevice> filtered = new ArrayList<>();
            for (VideoDevice d : cameraList) {
                String name = safe(d.getName());
                String address = safe(d.getIpAddress());
                boolean keywordMatch = keyword.isEmpty()
                        || name.toLowerCase(Locale.ROOT).contains(keyword)
                        || address.toLowerCase(Locale.ROOT).contains(keyword);
                if (keywordMatch && orgMatches(selectedFilterOrg, d.getCompany(), d.getProject(), d.getGrid(), d.getTeam())) {
                    filtered.add(d);
                }
            }
            adapter.setData(filtered);
            tvEmpty.setVisibility(filtered.isEmpty() ? View.VISIBLE : View.GONE);
        }

        private void showAddModeDialog() {
            new AlertDialog.Builder(requireContext())
                    .setTitle("添加摄像头")
                    .setItems(new String[]{"一般添加", "批量添加"}, (dialog, which) -> {
                        if (which == 0) {
                            showCameraForm(false, new DeviceDefaults());
                        } else {
                            showCameraDefaultsDialog();
                        }
                    })
                    .show();
        }

        private void showCameraDefaultsDialog() {
            LinearLayout root = formRoot(requireContext());
            OrgPicker org = addOrgPicker(root, "所属单位", null, this::showOrgTreePicker);
            EditText port = addInput(root, "端口", "80");
            Spinner platform = addSpinner(root, "平台类型", CAMERA_PLATFORM_LABELS);
            Spinner type = addSpinner(root, "设备类型", CAMERA_TYPE_LABELS);

            new AlertDialog.Builder(requireContext())
                    .setTitle("批量添加共同项")
                    .setView(scroll(root))
                    .setNegativeButton("取消", null)
                    .setPositiveButton("开始录入", (dialog, which) -> {
                        DeviceDefaults defaults = new DeviceDefaults();
                        defaults.orgNode = org.selected;
                        defaults.port = value(port);
                        defaults.platformType = spinnerValue(platform, CAMERA_PLATFORM_VALUES);
                        defaults.deviceType = spinnerValue(type, CAMERA_TYPE_VALUES);
                        showCameraForm(true, defaults);
                    })
                    .show();
        }

        private void showCameraForm(boolean batchMode, DeviceDefaults defaults) {
            LinearLayout root = formRoot(requireContext());
            CameraForm form = new CameraForm();
            form.name = addInput(root, "设备名称 *", "");
            form.address = addInput(root, "设备地址", "");
            form.serial = addInput(root, "设备序列号", "");
            form.cameraPassword = addInput(root, "摄像头密码", "");
            form.simCardId = addInput(root, "SIM卡号(ICCID)", "");
            Button scan = new Button(requireContext());
            scan.setText("扫码填写序列号");
            root.addView(scan);
            scan.setOnClickListener(v -> {
                activeScanForm = form;
                ensureCameraPermission();
            });
            form.channel = addInput(root, "通道号", "1");
            form.port = addInput(root, "端口", emptyDefault(defaults.port, "80"));
            form.installLocation = addInput(root, "安装位置", "");
            form.manager = addInput(root, "负责人", "");
            form.managerPhone = addInput(root, "负责人电话", "");
            form.remark = addInput(root, "备注", "");
            form.org = addOrgPicker(root, "所属单位", defaults.orgNode, this::showOrgTreePicker);
            form.platform = addSpinner(root, "平台类型", CAMERA_PLATFORM_LABELS);
            form.type = addSpinner(root, "设备类型", CAMERA_TYPE_LABELS);
            selectSpinnerByValue(form.platform, CAMERA_PLATFORM_VALUES, defaults.platformType);
            selectSpinnerByValue(form.type, CAMERA_TYPE_VALUES, defaults.deviceType);

            AlertDialog dialog = new AlertDialog.Builder(requireContext())
                    .setTitle(batchMode ? "批量添加摄像头" : "一般添加摄像头")
                    .setView(scroll(root))
                    .setNegativeButton("取消", null)
                    .setPositiveButton(batchMode ? "保存并继续" : "保存", null)
                    .show();
            dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener(v -> submitCamera(form, batchMode, dialog));
        }

        private void submitCamera(CameraForm form, boolean batchMode, AlertDialog dialog) {
            if (value(form.name).isEmpty()) {
                form.name.setError("设备名称必填");
                return;
            }
            if (!value(form.serial).isEmpty() && value(form.cameraPassword).isEmpty()) {
                form.cameraPassword.setError("填写设备序列号时必须填写摄像头密码");
                return;
            }

            VideoDevice req = new VideoDevice();
            req.setName(value(form.name));
            req.setIpAddress(value(form.address));
            req.setDeviceSerial(value(form.serial));
            req.setSimCardId(value(form.simCardId));
            req.setChannelNo(intValue(form.channel, 1));
            req.setPort(intValue(form.port, 80));
            req.setPlatformType(spinnerValue(form.platform, CAMERA_PLATFORM_VALUES));
            req.setDeviceType(spinnerValue(form.type, CAMERA_TYPE_VALUES));
            if (form.org.selected != null) {
                req.setCompany(form.org.selected.company);
                req.setProject(form.org.selected.project);
                req.setGrid(form.org.selected.grid);
                req.setTeam(form.org.selected.team);
            }
            req.setInstallLocation(value(form.installLocation));
            req.setManager(value(form.manager));
            req.setManagerPhone(value(form.managerPhone));
            req.setRemark(value(form.remark));
            req.setStatus("offline");
            req.setIsActive(1);

            if (!value(form.serial).isEmpty() || !value(form.simCardId).isEmpty()) {
                submitCameraRegistration(form, req, batchMode, dialog);
                return;
            }

            submitPlainCamera(form, req, batchMode, dialog);
        }

        private void submitPlainCamera(CameraForm form, VideoDevice req, boolean batchMode, AlertDialog dialog) {
            ApiClient.get(requireContext()).create(VideoApi.class)
                    .addCamera(req)
                    .enqueue(new Callback<VideoDevice>() {
                        @Override
                        public void onResponse(Call<VideoDevice> call, Response<VideoDevice> response) {
                            if (response.isSuccessful()) {
                                Toast.makeText(requireContext(), "添加成功", Toast.LENGTH_SHORT).show();
                                loadCameras();
                                if (batchMode) {
                                    form.name.setText("");
                                    form.address.setText("");
                                    form.serial.setText("");
                                    form.cameraPassword.setText("");
                                    form.simCardId.setText("");
                                } else {
                                    dialog.dismiss();
                                }
                            } else {
                                Toast.makeText(requireContext(), "添加失败", Toast.LENGTH_SHORT).show();
                            }
                        }

                        @Override
                        public void onFailure(Call<VideoDevice> call, Throwable t) {
                            Toast.makeText(requireContext(), "网络错误：" + t.getMessage(), Toast.LENGTH_SHORT).show();
                        }
                    });
        }

        private void submitCameraRegistration(CameraForm form, VideoDevice req, boolean batchMode, AlertDialog dialog) {
            JsonObject request = new JsonObject();
            put(request, "name", value(form.name));
            put(request, "device_serial", value(form.serial));
            put(request, "camera_password", value(form.cameraPassword));
            put(request, "sim_card_id", value(form.simCardId));
            request.addProperty("channel_no", intValue(form.channel, 1));
            put(request, "device_type", spinnerValue(form.type, CAMERA_TYPE_VALUES));
            put(request, "status", "offline");
            put(request, "remark", value(form.remark));
            put(request, "location", value(form.installLocation));
            put(request, "username", value(form.manager));
            if (form.org.selected != null) {
                put(request, "company", form.org.selected.company);
                put(request, "project", form.org.selected.project);
                put(request, "grid", form.org.selected.grid);
                put(request, "team", form.org.selected.team);
            }

            ApiClient.get(requireContext()).create(CameraRegistrationApi.class)
                    .registerCamera(request)
                    .enqueue(new Callback<JsonObject>() {
                        @Override
                        public void onResponse(Call<JsonObject> call, Response<JsonObject> response) {
                            if (response.isSuccessful()) {
                                Toast.makeText(requireContext(), registrationMessage(response.body()), Toast.LENGTH_LONG).show();
                                loadCameras();
                                if (batchMode) {
                                    form.name.setText("");
                                    form.address.setText("");
                                    form.serial.setText("");
                                    form.cameraPassword.setText("");
                                    form.simCardId.setText("");
                                } else {
                                    dialog.dismiss();
                                }
                            } else {
                                Toast.makeText(requireContext(), "自动注册失败: HTTP " + response.code(), Toast.LENGTH_SHORT).show();
                            }
                        }

                        @Override
                        public void onFailure(Call<JsonObject> call, Throwable t) {
                            Toast.makeText(requireContext(), "自动注册失败: " + t.getMessage(), Toast.LENGTH_SHORT).show();
                        }
                    });
        }

        private void ensureCameraPermission() {
            if (ContextCompat.checkSelfPermission(requireContext(), Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) {
                launchScanner();
            } else {
                cameraPermissionLauncher.launch(Manifest.permission.CAMERA);
            }
        }

        private void launchScanner() {
            scanLauncher.launch(QrScanOptions.cameraDevice("请扫描设备二维码。小标签请靠近至10-20厘米，避开反光，保持二维码铺满取景框。"));
        }

        private void applyCameraScanResult(CameraForm form, String raw) {
            CameraScanResult parsed = parseCameraScanContent(raw);
            if (!TextUtils.isEmpty(parsed.simCardId)) {
                form.simCardId.setText(parsed.simCardId);
                form.simCardId.setSelection(form.simCardId.length());
                return;
            }
            if (!TextUtils.isEmpty(parsed.deviceSerial)) {
                form.serial.setText(parsed.deviceSerial);
                form.serial.setSelection(form.serial.length());
            }
        }

        private void showOrgTreePicker(String title, OrgNode selected, OrgPickCallback callback) {
            showSharedOrgTreePicker(requireContext(), title, selectableOrgTreeNodes, selected, callback);
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
                holder.tvName.setText(emptyDefault(item.getName(), "-"));
                holder.tvDeviceId.setText(emptyDefault(item.getDeviceSerial(), "-"));
                holder.tvType.setText(cameraTypeLabel(item.getDeviceType()));
                holder.tvIp.setText("地址：" + emptyDefault(item.getIpAddress(), "-"));
                holder.tvPort.setText("端口：" + (item.getPort() != null ? item.getPort() : 80));
                holder.tvProject.setText("单位：" + orgPath(item.getCompany(), item.getProject(), item.getGrid(), item.getTeam()));
                String status = emptyDefault(item.getStatus(), "offline");
                holder.tvStatus.setText(status.equals("online") ? "在线" : "离线");
                holder.tvStatus.setBackgroundResource(status.equals("online") ? R.drawable.bg_circle_green : R.drawable.bg_circle_gray);
                if (holder.btnDelete != null) {
                    holder.btnDelete.setVisibility(View.GONE);
                }
            }

            @Override
            public int getItemCount() {
                return data.size();
            }

            class VH extends RecyclerView.ViewHolder {
                TextView tvName, tvDeviceId, tvType, tvIp, tvPort, tvProject, tvStatus;
                ImageView btnDelete;

                VH(View itemView) {
                    super(itemView);
                    tvName = itemView.findViewById(R.id.tv_name);
                    tvDeviceId = itemView.findViewById(R.id.tv_device_id);
                    tvType = itemView.findViewById(R.id.tv_type);
                    tvIp = itemView.findViewById(R.id.tv_ip);
                    tvPort = itemView.findViewById(R.id.tv_port);
                    tvProject = itemView.findViewById(R.id.tv_project);
                    tvStatus = itemView.findViewById(R.id.tv_status);
                    btnDelete = itemView.findViewById(R.id.btn_delete);
                }
            }
        }
    }

    public static class LocationDeviceFragment extends androidx.fragment.app.Fragment {
        private RecyclerView recyclerView;
        private LocationAdapter adapter;
        private List<LocationDevice> deviceList = new ArrayList<>();
        private SwipeRefreshLayout swipeRefresh;
        private EditText etSearch;
        private TextView tvEmpty;
        private OrgNode selectedFilterOrg;
        private final List<OrgNode> selectableOrgTreeNodes = new ArrayList<>();

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

            root.findViewById(R.id.btn_search).setOnClickListener(v -> applyDeviceFilters());
            root.findViewById(R.id.fab_add).setOnClickListener(v -> showAddModeDialog());
            TextView orgFilter = root.findViewById(R.id.btn_org_filter);
            TextView clearOrg = root.findViewById(R.id.btn_clear_org_filter);
            orgFilter.setText("单位筛选：全部");
            orgFilter.setOnClickListener(v -> showOrgTreePicker("按单位筛选", selectedFilterOrg, org -> {
                selectedFilterOrg = org;
                orgFilter.setText("单位筛选：" + org.path);
                applyDeviceFilters();
            }));
            clearOrg.setText("清除筛选");
            clearOrg.setOnClickListener(v -> {
                selectedFilterOrg = null;
                orgFilter.setText("单位筛选：全部");
                applyDeviceFilters();
            });
            swipeRefresh.setOnRefreshListener(this::loadDevices);

            loadDevices();
            loadSelectableOrgTree(this, selectableOrgTreeNodes);
            return root;
        }

        private void loadDevices() {
            swipeRefresh.setRefreshing(true);
            ApiClient.get(requireContext()).create(ManagementApi.class)
                    .getLocationDevices(authHeaders(requireContext()))
                    .enqueue(new Callback<List<JsonObject>>() {
                        @Override
                        public void onResponse(Call<List<JsonObject>> call, Response<List<JsonObject>> response) {
                            swipeRefresh.setRefreshing(false);
                            if (response.isSuccessful() && response.body() != null) {
                                deviceList = parseDeviceList(response.body());
                                applyDeviceFilters();
                            } else {
                                Toast.makeText(requireContext(), "加载失败", Toast.LENGTH_SHORT).show();
                            }
                        }

                        @Override
                        public void onFailure(Call<List<JsonObject>> call, Throwable t) {
                            swipeRefresh.setRefreshing(false);
                            Toast.makeText(requireContext(), "网络错误：" + t.getMessage(), Toast.LENGTH_SHORT).show();
                        }
                    });
        }

        private List<LocationDevice> parseDeviceList(List<JsonObject> jsonList) {
            List<LocationDevice> list = new ArrayList<>();
            for (JsonObject json : jsonList) {
                LocationDevice item = new LocationDevice();
                item.setDeviceId(jsonText(json, "device_id"));
                item.setName(jsonText(json, "name"));
                item.setType(jsonText(json, "type"));
                item.setCompany(jsonText(json, "company"));
                item.setProject(jsonText(json, "project"));
                item.setGrid(jsonText(json, "grid"));
                item.setTeam(jsonText(json, "team"));
                item.setHolder(jsonText(json, "holder"));
                item.setHolderPhone(jsonText(json, "holder_phone"));
                item.setStatus(emptyDefault(jsonText(json, "status"), "offline"));
                item.setRemark(jsonText(json, "remark"));
                list.add(item);
            }
            return list;
        }

        private void applyDeviceFilters() {
            String keyword = etSearch.getText().toString().trim().toLowerCase(Locale.ROOT);
            List<LocationDevice> filtered = new ArrayList<>();
            for (LocationDevice d : deviceList) {
                String name = safe(d.getName());
                String deviceId = safe(d.getDeviceId());
                boolean keywordMatch = keyword.isEmpty()
                        || name.toLowerCase(Locale.ROOT).contains(keyword)
                        || deviceId.toLowerCase(Locale.ROOT).contains(keyword);
                if (keywordMatch && orgMatches(selectedFilterOrg, d.getCompany(), d.getProject(), d.getGrid(), d.getTeam())) {
                    filtered.add(d);
                }
            }
            adapter.setData(filtered);
            tvEmpty.setVisibility(filtered.isEmpty() ? View.VISIBLE : View.GONE);
        }

        private void showAddModeDialog() {
            new AlertDialog.Builder(requireContext())
                    .setTitle("添加定位设备")
                    .setItems(new String[]{"一般添加", "批量添加"}, (dialog, which) -> {
                        if (which == 0) {
                            showLocationForm(false, new DeviceDefaults());
                        } else {
                            showLocationDefaultsDialog();
                        }
                    })
                    .show();
        }

        private void showLocationDefaultsDialog() {
            LinearLayout root = formRoot(requireContext());
            OrgPicker org = addOrgPicker(root, "所属单位 *", null, this::showOrgTreePicker);
            Spinner type = addSpinner(root, "设备类型", LOCATION_TYPE_LABELS);
            EditText holder = addInput(root, "持有人", "");

            new AlertDialog.Builder(requireContext())
                    .setTitle("批量添加共同项")
                    .setView(scroll(root))
                    .setNegativeButton("取消", null)
                    .setPositiveButton("开始录入", (dialog, which) -> {
                        DeviceDefaults defaults = new DeviceDefaults();
                        defaults.orgNode = org.selected;
                        defaults.deviceType = spinnerValue(type, LOCATION_TYPE_VALUES);
                        defaults.holder = value(holder);
                        showLocationForm(true, defaults);
                    })
                    .show();
        }

        private void showLocationForm(boolean batchMode, DeviceDefaults defaults) {
            LinearLayout root = formRoot(requireContext());
            LocationForm form = new LocationForm();
            form.name = addInput(root, "设备名称 *", "");
            form.deviceId = addInput(root, "设备编号", "");
            form.phoneNum = addInput(root, "设备识别码 *", "");
            form.holder = addInput(root, "持有人", defaults.holder);
            form.holderPhone = addInput(root, "持有人电话", "");
            form.remark = addInput(root, "备注", "");
            form.org = addOrgPicker(root, "所属单位 *", defaults.orgNode, this::showOrgTreePicker);
            form.type = addSpinner(root, "设备类型", LOCATION_TYPE_LABELS);
            selectSpinnerByValue(form.type, LOCATION_TYPE_VALUES, defaults.deviceType);

            AlertDialog dialog = new AlertDialog.Builder(requireContext())
                    .setTitle(batchMode ? "批量添加定位设备" : "一般添加定位设备")
                    .setView(scroll(root))
                    .setNegativeButton("取消", null)
                    .setPositiveButton(batchMode ? "保存并继续" : "保存", null)
                    .show();
            dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener(v -> submitLocationDevice(form, batchMode, dialog));
        }

        private void submitLocationDevice(LocationForm form, boolean batchMode, AlertDialog dialog) {
            if (value(form.name).isEmpty()) {
                form.name.setError("设备名称必填");
                return;
            }
            if (value(form.phoneNum).isEmpty()) {
                form.phoneNum.setError("设备识别码必填");
                return;
            }
            if (form.org.selected == null) {
                Toast.makeText(requireContext(), "请选择所属单位", Toast.LENGTH_SHORT).show();
                return;
            }

            JsonObject req = new JsonObject();
            put(req, "name", value(form.name));
            put(req, "device_id", value(form.deviceId));
            put(req, "phone_num", value(form.phoneNum));
            put(req, "type", spinnerValue(form.type, LOCATION_TYPE_VALUES));
            put(req, "company", form.org.selected.company);
            put(req, "project", form.org.selected.project);
            put(req, "grid", form.org.selected.grid);
            put(req, "team", form.org.selected.team);
            put(req, "holder", value(form.holder));
            put(req, "holder_phone", value(form.holderPhone));
            put(req, "remark", value(form.remark));
            put(req, "status", "offline");

            ApiClient.get(requireContext()).create(ManagementApi.class)
                    .addLocationDevice(authHeaders(requireContext()), req)
                    .enqueue(new Callback<JsonObject>() {
                        @Override
                        public void onResponse(Call<JsonObject> call, Response<JsonObject> response) {
                            if (response.isSuccessful()) {
                                Toast.makeText(requireContext(), "添加成功", Toast.LENGTH_SHORT).show();
                                loadDevices();
                                if (batchMode) {
                                    form.name.setText("");
                                    form.deviceId.setText("");
                                    form.phoneNum.setText("");
                                } else {
                                    dialog.dismiss();
                                }
                            } else {
                                Toast.makeText(requireContext(), "添加失败", Toast.LENGTH_SHORT).show();
                            }
                        }

                        @Override
                        public void onFailure(Call<JsonObject> call, Throwable t) {
                            Toast.makeText(requireContext(), "网络错误：" + t.getMessage(), Toast.LENGTH_SHORT).show();
                        }
                    });
        }

        private void showOrgTreePicker(String title, OrgNode selected, OrgPickCallback callback) {
            showSharedOrgTreePicker(requireContext(), title, selectableOrgTreeNodes, selected, callback);
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
                holder.tvName.setText(emptyDefault(item.getName(), "-"));
                holder.tvDeviceId.setText("编号：" + emptyDefault(item.getDeviceId(), "-"));
                holder.tvType.setText(locationTypeLabel(item.getType()));
                holder.tvHolder.setText("持有人：" + emptyDefault(item.getHolder(), "-"));
                if (holder.tvBindPerson != null) {
                    holder.tvBindPerson.setText("单位：" + orgPath(item.getCompany(), item.getProject(), item.getGrid(), item.getTeam()));
                }
                String status = emptyDefault(item.getStatus(), "offline");
                holder.tvStatus.setText(status.equals("online") ? "在线" : status.equals("fault") ? "故障" : "离线");
                int bgRes = status.equals("online") ? R.drawable.bg_circle_green : status.equals("fault") ? R.drawable.bg_circle_red : R.drawable.bg_circle_gray;
                holder.tvStatus.setBackgroundResource(bgRes);
                if (holder.btnDelete != null) {
                    holder.btnDelete.setVisibility(View.GONE);
                }
            }

            @Override
            public int getItemCount() {
                return data.size();
            }

            class VH extends RecyclerView.ViewHolder {
                TextView tvName, tvDeviceId, tvType, tvHolder, tvBindPerson, tvStatus;
                ImageView btnDelete;

                VH(View itemView) {
                    super(itemView);
                    tvName = itemView.findViewById(R.id.tv_name);
                    tvDeviceId = itemView.findViewById(R.id.tv_device_id);
                    tvType = itemView.findViewById(R.id.tv_type);
                    tvHolder = itemView.findViewById(R.id.tv_holder);
                    tvBindPerson = itemView.findViewById(R.id.tv_bind_person);
                    tvStatus = itemView.findViewById(R.id.tv_status);
                    btnDelete = itemView.findViewById(R.id.btn_delete);
                }
            }
        }
    }

    private static LinearLayout formRoot(Context context) {
        LinearLayout root = new LinearLayout(context);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding(32, 8, 32, 0);
        return root;
    }

    private static ScrollView scroll(View child) {
        ScrollView scrollView = new ScrollView(child.getContext());
        scrollView.addView(child);
        return scrollView;
    }

    private static EditText addInput(LinearLayout root, String hint, String text) {
        EditText input = new EditText(root.getContext());
        input.setHint(hint);
        input.setSingleLine(true);
        input.setText(text == null ? "" : text);
        root.addView(input, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        return input;
    }

    private static Spinner addSpinner(LinearLayout root, String label, String[] labels) {
        TextView title = new TextView(root.getContext());
        title.setText(label);
        title.setTextSize(13);
        title.setPadding(0, 12, 0, 0);
        root.addView(title);
        Spinner spinner = new Spinner(root.getContext());
        spinner.setAdapter(new ArrayAdapter<>(root.getContext(), android.R.layout.simple_spinner_dropdown_item, labels));
        root.addView(spinner);
        return spinner;
    }

    private static OrgPicker addOrgPicker(LinearLayout root, String label, OrgNode selected, OrgPickerLauncher launcher) {
        TextView title = new TextView(root.getContext());
        title.setText(label);
        title.setTextSize(13);
        title.setPadding(0, 12, 0, 4);
        root.addView(title);
        Button button = new Button(root.getContext());
        OrgPicker picker = new OrgPicker(button, selected);
        picker.refresh();
        button.setOnClickListener(v -> launcher.open("选择所属单位", picker.selected, org -> {
            picker.selected = org;
            picker.refresh();
        }));
        root.addView(button);
        return picker;
    }

    private static void showSharedOrgTreePicker(Context context, String title, List<OrgNode> nodes, OrgNode selected, OrgPickCallback callback) {
        if (nodes.isEmpty()) {
            Toast.makeText(context, "暂无可选单位", Toast.LENGTH_SHORT).show();
            return;
        }
        LinearLayout root = new LinearLayout(context);
        root.setOrientation(LinearLayout.VERTICAL);
        Set<String> expanded = new HashSet<>();
        if (selected != null) {
            String[] parts = selected.key.split("\\|", -1);
            String company = parts.length > 0 ? parts[0] : "";
            String project = parts.length > 1 ? parts[1] : "";
            String grid = parts.length > 2 ? parts[2] : "";
            if (!company.isEmpty()) expanded.add(company + "|||");
            if (!project.isEmpty()) expanded.add(company + "|" + project + "||");
            if (!grid.isEmpty()) expanded.add(company + "|" + project + "|" + grid + "|");
        }
        AlertDialog dialog = new AlertDialog.Builder(context)
                .setTitle(title)
                .setView(scroll(root))
                .setNegativeButton("取消", null)
                .create();
        Runnable[] render = new Runnable[1];
        render[0] = () -> {
            root.removeAllViews();
            for (OrgNode node : visibleNodes(nodes, expanded)) {
                TextView row = new TextView(context);
                boolean hasChildren = hasChildren(nodes, node);
                String toggle = hasChildren ? (expanded.contains(node.key) ? "-  " : "+  ") : "   ";
                row.setText(indent(node.level) + toggle + node.name);
                row.setTextSize(15);
                row.setPadding(12, 14, 12, 14);
                row.setOnClickListener(v -> {
                    if (hasChildren) {
                        if (expanded.contains(node.key)) {
                            expanded.remove(node.key);
                        } else {
                            expanded.add(node.key);
                        }
                        render[0].run();
                    } else {
                        callback.pick(node);
                        dialog.dismiss();
                    }
                });
                row.setOnLongClickListener(v -> {
                    callback.pick(node);
                    dialog.dismiss();
                    return true;
                });
                root.addView(row);
            }
        };
        render[0].run();
        dialog.show();
    }

    private static List<OrgNode> visibleNodes(List<OrgNode> nodes, Set<String> expanded) {
        List<OrgNode> result = new ArrayList<>();
        for (OrgNode node : nodes) {
            if (node.level == 0 || ancestorsExpanded(node, expanded)) {
                result.add(node);
            }
        }
        return result;
    }

    private static boolean ancestorsExpanded(OrgNode node, Set<String> expanded) {
        if (node.level == 0) return true;
        if (!expanded.contains(node.company + "|||")) return false;
        if (node.level >= 2 && !expanded.contains(node.company + "|" + node.project + "||")) return false;
        return node.level < 3 || expanded.contains(node.company + "|" + node.project + "|" + node.grid + "|");
    }

    private static boolean hasChildren(List<OrgNode> nodes, OrgNode parent) {
        for (OrgNode node : nodes) {
            if (node.level == parent.level + 1 && isParent(parent, node)) {
                return true;
            }
        }
        return false;
    }

    private static boolean isParent(OrgNode parent, OrgNode child) {
        if (parent.level == 0) return parent.company.equals(child.company);
        if (parent.level == 1) return parent.company.equals(child.company) && parent.project.equals(child.project);
        if (parent.level == 2) return parent.company.equals(child.company) && parent.project.equals(child.project) && parent.grid.equals(child.grid);
        return false;
    }

    private static String indent(int level) {
        StringBuilder builder = new StringBuilder();
        for (int i = 0; i < level; i++) {
            builder.append("    ");
        }
        return builder.toString();
    }

    private static void loadSelectableOrgTree(androidx.fragment.app.Fragment fragment, List<OrgNode> target) {
        ApiClient.get(fragment.requireContext()).create(ManagementApi.class)
                .getResponsibilityTree(authHeaders(fragment.requireContext()))
                .enqueue(new Callback<List<JsonObject>>() {
                    @Override
                    public void onResponse(Call<List<JsonObject>> call, Response<List<JsonObject>> response) {
                        target.clear();
                        if (response.isSuccessful() && response.body() != null) {
                            for (JsonObject node : response.body()) {
                                collectOrgTreeNode(target, node, "", "", "", "");
                            }
                        }
                    }

                    @Override
                    public void onFailure(Call<List<JsonObject>> call, Throwable t) {
                        target.clear();
                    }
                });
    }

    private static void collectOrgTreeNode(List<OrgNode> target, JsonObject node, String company, String project, String grid, String team) {
        String name = jsonText(node, "name");
        String type = normalizeUnitType(jsonText(node, "type"));
        String nextCompany = company;
        String nextProject = project;
        String nextGrid = grid;
        String nextTeam = team;
        if ("company".equals(type)) nextCompany = name;
        else if ("project".equals(type)) nextProject = name;
        else if ("grid".equals(type)) nextGrid = name;
        else if ("team".equals(type)) nextTeam = name;
        else if (company.isEmpty()) nextCompany = name;

        OrgNode org = new OrgNode(nextCompany, nextProject, nextGrid, nextTeam);
        if (!org.path.isEmpty() && !containsOrg(target, org.key)) {
            target.add(org);
        }

        JsonElement children = node.get("children");
        if (children != null && children.isJsonArray()) {
            for (JsonElement child : children.getAsJsonArray()) {
                if (child.isJsonObject()) {
                    collectOrgTreeNode(target, child.getAsJsonObject(), nextCompany, nextProject, nextGrid, nextTeam);
                }
            }
        }
    }

    private static boolean containsOrg(List<OrgNode> nodes, String key) {
        for (OrgNode node : nodes) {
            if (node.key.equals(key)) return true;
        }
        return false;
    }

    private static boolean orgMatches(OrgNode selected, String company, String project, String grid, String team) {
        if (selected == null) return true;
        return selected.company.equals(safe(company))
                && (selected.project.isEmpty() || selected.project.equals(safe(project)))
                && (selected.grid.isEmpty() || selected.grid.equals(safe(grid)))
                && (selected.team.isEmpty() || selected.team.equals(safe(team)));
    }

    private static Map<String, String> authHeaders(Context context) {
        Map<String, String> headers = new HashMap<>();
        String token = SessionManager.getToken(context);
        if (token != null && !token.isEmpty()) {
            headers.put("Authorization", "Bearer " + token);
        }
        return headers;
    }

    private static CameraScanResult parseCameraScanContent(String raw) {
        CameraScanResult result = new CameraScanResult();
        String text = raw == null ? "" : raw.trim();
        if (TextUtils.isEmpty(text)) return result;

        String[] hikvisionParts = parseHikvisionSingleQr(text);
        if (hikvisionParts != null) {
            result.deviceSerial = hikvisionParts[0];
            result.model = hikvisionParts[2];
            return result;
        }

        if (text.startsWith("{")) {
            try {
                JsonObject obj = JsonParser.parseString(text).getAsJsonObject();
                result.deviceSerial = first(jsonStringAnyCase(obj, "deviceSerial"), jsonStringAnyCase(obj, "device_serial"));
                result.deviceSerial = first(result.deviceSerial, jsonStringAnyCase(obj, "serial"));
                result.deviceSerial = first(result.deviceSerial, jsonStringAnyCase(obj, "sn"));
                result.simCardId = first(jsonStringAnyCase(obj, "sim_card_id"), jsonStringAnyCase(obj, "simCardId"));
                result.simCardId = first(result.simCardId, jsonStringAnyCase(obj, "iccid"));
                result.simCardId = first(result.simCardId, jsonStringAnyCase(obj, "sim"));
                if (!TextUtils.isEmpty(result.simCardId)) result.simCardId = digitsOnly(result.simCardId);
                return result;
            } catch (Exception ignored) {
            }
        }

        result.deviceSerial = first(findQueryLikeValue(text, "deviceSerial"), findQueryLikeValue(text, "device_serial"));
        result.deviceSerial = first(result.deviceSerial, findQueryLikeValue(text, "serial"));
        result.deviceSerial = first(result.deviceSerial, findQueryLikeValue(text, "sn"));
        result.deviceSerial = first(result.deviceSerial, findQueryLikeValue(text, "code"));
        result.simCardId = first(findQueryLikeValue(text, "sim_card_id"), findQueryLikeValue(text, "simCardId"));
        result.simCardId = first(result.simCardId, findQueryLikeValue(text, "iccid"));
        result.simCardId = first(result.simCardId, findQueryLikeValue(text, "sim"));
        if (!TextUtils.isEmpty(result.simCardId)) result.simCardId = digitsOnly(result.simCardId);

        if (TextUtils.isEmpty(result.deviceSerial) && TextUtils.isEmpty(result.simCardId)) {
            if (looksLikeIccid(text)) {
                result.simCardId = digitsOnly(text);
            } else {
                result.deviceSerial = text;
            }
        }
        return result;
    }

    private static String[] parseHikvisionSingleQr(String text) {
        if (TextUtils.isEmpty(text)) return null;
        String lower = text.toLowerCase(Locale.ROOT);
        if (!lower.contains("support.hikvision.com") && !lower.contains("sn=")) return null;

        int snIndex = lower.indexOf("sn=");
        if (snIndex < 0) return null;
        String afterSn = decode(text.substring(snIndex + 3)).trim();
        if (TextUtils.isEmpty(afterSn)) return null;

        String[] rawLines = afterSn.split("\\r\\n|\\r|\\n");
        List<String> lines = new ArrayList<>();
        for (String rawLine : rawLines) {
            String line = rawLine.trim();
            if (!TextUtils.isEmpty(line)) lines.add(line);
        }
        if (lines.isEmpty()) return null;

        return new String[] {
                lines.get(0),
                lines.size() > 1 ? lines.get(1) : "",
                lines.size() > 2 ? lines.get(2) : ""
        };
    }

    private static String findQueryLikeValue(String text, String key) {
        if (TextUtils.isEmpty(text)) return "";
        String normalized = text.replace('\n', '&').replace('\r', '&');
        String prefix = key.toLowerCase(Locale.ROOT) + "=";
        String[] parts = normalized.split("[?&#]");
        for (String part : parts) {
            for (String pair : part.split("&")) {
                String trimmed = pair.trim();
                if (trimmed.toLowerCase(Locale.ROOT).startsWith(prefix)) {
                    return decode(trimmed.substring(prefix.length())).trim();
                }
            }
        }
        return "";
    }

    private static String jsonStringAnyCase(JsonObject obj, String key) {
        if (obj == null) return "";
        for (String candidate : obj.keySet()) {
            if (candidate.equalsIgnoreCase(key) && !obj.get(candidate).isJsonNull()) {
                return obj.get(candidate).getAsString().trim();
            }
        }
        return "";
    }

    private static boolean looksLikeIccid(String value) {
        String digits = digitsOnly(value);
        return digits.length() == 20 && digits.startsWith("8986");
    }

    private static String digitsOnly(String value) {
        return value == null ? "" : value.replaceAll("\\D+", "");
    }

    private static String decode(String value) {
        try {
            return URLDecoder.decode(value, StandardCharsets.UTF_8.name());
        } catch (Exception ignored) {
            return value;
        }
    }

    private static String first(String a, String b) {
        return TextUtils.isEmpty(a) ? (b == null ? "" : b) : a;
    }

    private static String normalizeUnitType(String type) {
        String lower = safe(type).toLowerCase(Locale.ROOT);
        if (lower.contains("project") || "项目".equals(type)) return "project";
        if (lower.contains("grid") || "网格".equals(type)) return "grid";
        if (lower.contains("team") || "工队".equals(type)) return "team";
        return "company";
    }

    private static String jsonText(JsonObject json, String key) {
        if (json == null || !json.has(key) || json.get(key).isJsonNull()) return "";
        return json.get(key).getAsString();
    }

    private static String registrationMessage(JsonObject response) {
        if (response == null) return "摄像头已保存并提交自动注册";
        boolean partial = response.has("partial_success") && response.get("partial_success").getAsBoolean();
        boolean success = response.has("success") && response.get("success").getAsBoolean();
        if (partial) return "摄像头已保存，部分平台注册失败";
        return success ? "摄像头已保存并注册成功" : "摄像头已保存，平台注册失败";
    }

    private static String value(EditText editText) {
        return editText.getText().toString().trim();
    }

    private static int intValue(EditText editText, int fallback) {
        try {
            return Integer.parseInt(value(editText));
        } catch (Exception ignored) {
            return fallback;
        }
    }

    private static String spinnerValue(Spinner spinner, String[] values) {
        int index = spinner.getSelectedItemPosition();
        return index >= 0 && index < values.length ? values[index] : values[0];
    }

    private static void selectSpinnerByValue(Spinner spinner, String[] values, String value) {
        if (value == null) return;
        for (int i = 0; i < values.length; i++) {
            if (value.equals(values[i])) {
                spinner.setSelection(i);
                return;
            }
        }
    }

    private static void put(JsonObject json, String key, String value) {
        if (value != null && !value.isEmpty()) {
            json.addProperty(key, value);
        }
    }

    private static String safe(String value) {
        return value == null ? "" : value;
    }

    private static String emptyDefault(String value, String fallback) {
        return value == null || value.isEmpty() ? fallback : value;
    }

    private static String cameraTypeLabel(String value) {
        for (int i = 0; i < CAMERA_TYPE_VALUES.length; i++) {
            if (CAMERA_TYPE_VALUES[i].equals(value)) return CAMERA_TYPE_LABELS[i];
        }
        return "摄像头";
    }

    private static String locationTypeLabel(String value) {
        for (int i = 0; i < LOCATION_TYPE_VALUES.length; i++) {
            if (LOCATION_TYPE_VALUES[i].equals(value)) return LOCATION_TYPE_LABELS[i];
        }
        return "定位终端";
    }

    private static String orgPath(String company, String project, String grid, String team) {
        List<String> parts = new ArrayList<>();
        if (!safe(company).isEmpty()) parts.add(company);
        if (!safe(project).isEmpty()) parts.add(project);
        if (!safe(grid).isEmpty()) parts.add(grid);
        if (!safe(team).isEmpty()) parts.add(team);
        return parts.isEmpty() ? "-" : TextUtils.join(" / ", parts);
    }

    private interface OrgPickCallback {
        void pick(OrgNode node);
    }

    private interface OrgPickerLauncher {
        void open(String title, OrgNode selected, OrgPickCallback callback);
    }

    private static class OrgPicker {
        final Button button;
        OrgNode selected;

        OrgPicker(Button button, OrgNode selected) {
            this.button = button;
            this.selected = selected;
        }

        void refresh() {
            button.setText(selected == null ? "请选择所属单位" : selected.path);
        }
    }

    private static class OrgNode {
        final String company;
        final String project;
        final String grid;
        final String team;
        final String name;
        final String path;
        final String key;
        final int level;

        OrgNode(String company, String project, String grid, String team) {
            this.company = safe(company);
            this.project = safe(project);
            this.grid = safe(grid);
            this.team = safe(team);
            if (!this.team.isEmpty()) {
                level = 3;
                name = this.team;
            } else if (!this.grid.isEmpty()) {
                level = 2;
                name = this.grid;
            } else if (!this.project.isEmpty()) {
                level = 1;
                name = this.project;
            } else {
                level = 0;
                name = this.company;
            }
            path = orgPath(this.company, this.project, this.grid, this.team);
            key = this.company + "|" + this.project + "|" + this.grid + "|" + this.team;
        }
    }

    private static class DeviceDefaults {
        OrgNode orgNode;
        String port = "80";
        String platformType = "custom";
        String deviceType = "camera";
        String holder = "";
    }

    private static class CameraForm {
        EditText name;
        EditText address;
        EditText serial;
        EditText cameraPassword;
        EditText simCardId;
        EditText channel;
        EditText port;
        EditText installLocation;
        EditText manager;
        EditText managerPhone;
        EditText remark;
        Spinner platform;
        Spinner type;
        OrgPicker org;
    }

    private static class CameraScanResult {
        String deviceSerial = "";
        String simCardId = "";
        String model = "";
    }

    private static class LocationForm {
        EditText name;
        EditText deviceId;
        EditText phoneNum;
        EditText holder;
        EditText holderPhone;
        EditText remark;
        Spinner type;
        OrgPicker org;
    }

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
