package com.app.myapplication.ui.fence;

import android.Manifest;
import android.content.pm.PackageManager;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.location.Location;
import android.os.Bundle;
import android.text.TextUtils;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.*;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.appcompat.app.AlertDialog;
import androidx.appcompat.app.AppCompatActivity;
import androidx.appcompat.widget.SwitchCompat;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import androidx.recyclerview.widget.LinearLayoutManager;
import androidx.recyclerview.widget.RecyclerView;

import com.amap.api.maps.AMap;
import com.amap.api.maps.AMapUtils;
import com.amap.api.maps.CameraUpdateFactory;
import com.amap.api.maps.MapView;
import com.amap.api.maps.model.*;
import com.amap.api.maps.model.MyLocationStyle;

import org.json.JSONArray;

import com.app.myapplication.R;
import com.app.myapplication.data.api.AlarmApi;
import com.app.myapplication.data.api.ApiClient;
import com.app.myapplication.data.api.DeviceApi;
import com.app.myapplication.data.model.Alarm;
import com.app.myapplication.data.model.DeviceItem;
import com.app.myapplication.data.repo.DeviceRepository;
import com.app.myapplication.ui.device.DeviceMapRenderer;
import com.google.gson.*;

import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

import retrofit2.Call;
import retrofit2.Callback;
import retrofit2.Response;
import retrofit2.Retrofit;
import retrofit2.http.*;

public class FenceCenterActivity extends AppCompatActivity {

    // -------------------------
    // Retrofit API - 对齐后端新接口
    // -------------------------
    interface FenceApi {
        @GET("fence/list")
        Call<JsonArray> getFences();

        @POST("fence/")
        Call<JsonObject> createFence(@Body JsonObject body);

        @PUT("fence/{fence_id}")
        Call<JsonObject> updateFence(@Path("fence_id") String id, @Body JsonObject body);

        @DELETE("fence/delete/{fence_id}")
        Call<JsonObject> deleteFence(@Path("fence_id") String id);

        @GET("fence/regions")
        Call<JsonArray> getRegions();
    }



    // -------------------------
    // UI / Map
    // -------------------------
    private static final int REQ_LOCATION = 10010;
    private static final double EARTH_RADIUS = 6378137.0;

    private static final String BEHAVIOR_NO_ENTRY = "No Entry"; // 禁入
    private static final String BEHAVIOR_NO_EXIT  = "No Exit";  // 禁出

    private MapView mapView;
    private AMap aMap;

    private Button btnNew, btnList, btnLocate;
    private View panelAdd, panelList;

    private EditText etName, etRadius;
    private SeekBar sbRadius;
    private RadioGroup rgShape;
    private RadioButton rbCircle, rbPolygon;
    private View groupCircle, groupPolygon;
    private Button btnUndo, btnClear, btnCancel, btnSave;

    private Spinner spTriggerType;
    private Switch swEnable;

    private RecyclerView rvFence;
    private RecyclerView rvDevice;
    private Button btnCloseList;
    private Button btnTabFence;
    private Button btnTabDevice;
    private TextView tvListTitle;

    private FenceListAdapter fenceAdapter;
    private com.app.myapplication.ui.device.DeviceListAdapter deviceAdapter;

    // -------------------------
    // State
    // -------------------------
    private FenceApi api;
    private DeviceRepository deviceRepo;
    private DeviceMapRenderer deviceRenderer;

    private final List<UiFence> fences = new ArrayList<>();
    private final List<UiRegion> regions = new ArrayList<>();
    private final List<DeviceItem> devices = new ArrayList<>();

    private boolean addMode = false;

    // �?编辑模式
    private boolean editMode = false;
    private String editingFenceId = null;
    private UiFence editingOrigin = null;

    // Circle draft
    private LatLng circleCenter = null;
    private double circleRadius = 50; // meters
    private Marker circleCenterMarker = null;
    private Marker radiusHandleMarker = null;
    private Circle previewCircle = null;

    // Polygon draft (outline only)
    private final List<LatLng> polygonPoints = new ArrayList<>();
    private final List<Marker> polygonPointMarkers = new ArrayList<>();
    private Polyline polygonPreviewLine = null;

    private boolean suppressUiSync = false;

    // My location
    private LatLng lastMyLocation = null;
    private Marker myLocationMarker = null;

    // For camera once
    private boolean firstServerRenderDone = false;

    // spinner adapter
    private ArrayAdapter<String> behaviorAdapter;

    // 调试模式
    private boolean debugMode = false;
    private com.google.android.material.floatingactionbutton.FloatingActionButton btnDebugMode;
    private com.google.android.material.card.MaterialCardView cardDebugIndicator;
    private final Map<String, DevicePosition> manualPositions = new HashMap<>();  // 手动调整的位置
    private DeviceApi deviceApi;

    // 报警相关
    private AlarmApi alarmApi;
    private final Map<String, String> deviceViolations = new HashMap<>();  // 设备违规状态：deviceId -> violationType
    private ScheduledExecutorService alarmPollingExecutor;

    // 记录原始位置
    private static class DevicePosition {
        double lat;
        double lng;
        double originalLat;
        double originalLng;

        DevicePosition(double lat, double lng, double originalLat, double originalLng) {
            this.lat = lat;
            this.lng = lng;
            this.originalLat = originalLat;
            this.originalLng = originalLng;
        }
    }

    // -------------------------
    // Lifecycle
    // -------------------------
    @Override
    protected void onCreate(@Nullable Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_fence_center);

        Retrofit rf = ApiClient.get(getApplicationContext());
        api = rf.create(FenceApi.class);
        deviceApi = rf.create(DeviceApi.class);
        alarmApi = rf.create(AlarmApi.class);
        deviceRepo = new DeviceRepository(this);

        bindViews();
        initRecycler();
        initMap(savedInstanceState);
        initDebugMode();  // 移到initMap之后，因为deviceRenderer在这里初始化
        initUiLogic();

        refreshFromServer();
    }

    private void bindViews() {
        mapView = findViewById(R.id.mapView);

        btnNew = findViewById(R.id.btn_new);
        btnList = findViewById(R.id.btn_list);
        btnLocate = findViewById(R.id.btn_locate);

        panelAdd = findViewById(R.id.panel_add);
        panelList = findViewById(R.id.panel_list);

        etName = findViewById(R.id.et_fence_name);
        etRadius = findViewById(R.id.et_fence_radius);
        sbRadius = findViewById(R.id.sb_radius);

        rgShape = findViewById(R.id.rg_shape);
        rbCircle = findViewById(R.id.rb_circle);
        rbPolygon = findViewById(R.id.rb_polygon);

        groupCircle = findViewById(R.id.group_circle);
        groupPolygon = findViewById(R.id.group_polygon);

        btnUndo = findViewById(R.id.btn_undo);
        btnClear = findViewById(R.id.btn_clear);

        spTriggerType = findViewById(R.id.sp_trigger_type);
        swEnable = findViewById(R.id.sw_enable);

        btnCancel = findViewById(R.id.btn_cancel);
        btnSave = findViewById(R.id.btn_save);

        rvFence = findViewById(R.id.rv_fence);
        rvDevice = findViewById(R.id.rv_device);
        btnCloseList = findViewById(R.id.btn_close_list);
        btnTabFence = findViewById(R.id.btn_tab_fence);
        btnTabDevice = findViewById(R.id.btn_tab_device);
        tvListTitle = findViewById(R.id.tv_list_title);

        // spinner
        List<String> items = new ArrayList<>();
        items.add("禁入（No Entry）");
        items.add("禁出（No Exit）");
        behaviorAdapter = new ArrayAdapter<>(this, android.R.layout.simple_spinner_item, items);
        behaviorAdapter.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item);
        spTriggerType.setAdapter(behaviorAdapter);

        // 调试模式按钮
        btnDebugMode = findViewById(R.id.btn_debug_mode);
        cardDebugIndicator = findViewById(R.id.card_debug_indicator);
    }

    private void initRecycler() {
        // 围栏列表
        rvFence.setLayoutManager(new LinearLayoutManager(this));
        fenceAdapter = new FenceListAdapter(
                fences,
                this::showFenceActions,
                this::toggleFenceEnable,
                this::confirmDeleteFence
        );
        rvFence.setAdapter(fenceAdapter);

        // 设备列表
        rvDevice.setLayoutManager(new LinearLayoutManager(this));
        deviceAdapter = new com.app.myapplication.ui.device.DeviceListAdapter(
                devices,
                new com.app.myapplication.ui.device.DeviceListAdapter.OnDeviceClickListener() {
                    @Override
                    public void onDeviceClick(DeviceItem device) {
                        focusOnDevice(device);
                    }

                    @Override
                    public void onDeviceLongClick(DeviceItem device) {
                        // 长按显示设备详情或操作
                        showDeviceActions(device);
                    }
                }
        );
        rvDevice.setAdapter(deviceAdapter);
    }

    private void initMap(Bundle savedInstanceState) {
        mapView.onCreate(savedInstanceState);
        aMap = mapView.getMap();

        // 初始化设备地图渲染器
        deviceRenderer = new DeviceMapRenderer(this, aMap);

        aMap.moveCamera(CameraUpdateFactory.newLatLngZoom(new LatLng(31.2304, 121.4737), 12f));

        aMap.setOnMapClickListener(latLng -> {
            if (!addMode) return;
            if (isPolygonMode()) addPolygonPoint(latLng);
            else setCircleCenter(latLng);
        });

        aMap.setOnMarkerDragListener(new AMap.OnMarkerDragListener() {
            @Override public void onMarkerDragStart(Marker marker) {}

            @Override public void onMarkerDrag(Marker marker) {
                if (!addMode || !isCircleMode()) return;
                if (radiusHandleMarker == null || marker != radiusHandleMarker) return;
                if (circleCenter == null) return;

                float dist = AMapUtils.calculateLineDistance(circleCenter, marker.getPosition());
                dist = Math.max(5f, Math.min(20000f, dist));
                circleRadius = dist;

                if (previewCircle != null) previewCircle.setRadius(circleRadius);
                syncRadiusUiFromValue();
            }

            @Override public void onMarkerDragEnd(Marker marker) {
                if (!addMode || !isCircleMode()) return;
                if (radiusHandleMarker == null || marker != radiusHandleMarker) return;
                if (circleCenter == null) return;
                marker.setPosition(offsetEast(circleCenter, circleRadius));
            }
        });

        aMap.setOnMyLocationChangeListener((Location location) -> {
            if (location == null) return;
            lastMyLocation = new LatLng(location.getLatitude(), location.getLongitude());
        });
    }

    private void initUiLogic() {
        btnNew.setOnClickListener(v -> enterAddMode());

        btnList.setOnClickListener(v -> {
            if (panelList.getVisibility() == View.VISIBLE) {
                panelList.setVisibility(View.GONE);
            } else {
                panelList.setVisibility(View.VISIBLE);
                showFenceList(); // 默认显示围栏列表
            }
        });
        btnCloseList.setOnClickListener(v -> panelList.setVisibility(View.GONE));

        // 列表切换按钮
        btnTabFence.setOnClickListener(v -> showFenceList());
        btnTabDevice.setOnClickListener(v -> showDeviceList());

        btnLocate.setOnClickListener(v -> ensurePermissionThenLocate());

        rgShape.setOnCheckedChangeListener((g, id) -> {
            if (!addMode) return;
            updateShapeUi();
            clearDraftOnly();
            redrawAll();
        });

        sbRadius.setOnSeekBarChangeListener(new SeekBar.OnSeekBarChangeListener() {
            @Override public void onProgressChanged(SeekBar seekBar, int progress, boolean fromUser) {
                if (!addMode || !isCircleMode() || !fromUser) return;
                progress = clamp(progress, 5, 20000);
                circleRadius = progress;
                syncRadiusUiFromValue();
                updateCirclePreviewGeometry();
            }
            @Override public void onStartTrackingTouch(SeekBar seekBar) {}
            @Override public void onStopTrackingTouch(SeekBar seekBar) {}
        });

        etRadius.setOnFocusChangeListener((v, hasFocus) -> {
            if (hasFocus) return;
            if (!addMode || !isCircleMode()) return;
            applyRadiusFromEditText();
        });

        btnUndo.setOnClickListener(v -> {
            if (!addMode || !isPolygonMode()) return;
            undoPolygonPoint();
        });

        btnClear.setOnClickListener(v -> {
            if (!addMode || !isPolygonMode()) return;
            clearPolygonDraft();
            redrawPolygonPreviewLine();
        });

        btnCancel.setOnClickListener(v -> exitAddOrEditMode());
        btnSave.setOnClickListener(v -> saveFenceToServer());
    }

    // -------------------------
    // Debug Mode
    // -------------------------
    private void initDebugMode() {
        btnDebugMode.setOnClickListener(v -> toggleDebugMode());

        // 设置设备位置变化监听器
        deviceRenderer.setOnDevicePositionChangeListener((deviceId, lat, lng) -> {
            android.util.Log.d("DebugMode", "位置变化回调: deviceId=" + deviceId + ", lat=" + lat + ", lng=" + lng + ", debugMode=" + debugMode);

            if (!debugMode) {
                android.util.Log.d("DebugMode", "非调试模式，忽略位置变化");
                return;
            }

            // 记录手动调整的位置
            DeviceItem device = findDeviceById(deviceId);
            if (device != null) {
                double originalLat = device.lat;
                double originalLng = device.lng;
                manualPositions.put(deviceId, new DevicePosition(lat, lng, originalLat, originalLng));

                android.util.Log.d("DebugMode", "记录手动位置: " + deviceId + " -> (" + lat + ", " + lng + "), 原始位置: (" + originalLat + ", " + originalLng + ")");
                android.util.Log.d("DebugMode", "当前manualPositions大小: " + manualPositions.size());

                // 更新设备对象的位置（用于本地显示）
                device.lat = lat;
                device.lng = lng;

                toast("设备位置已调整: " + device.name);
            } else {
                android.util.Log.e("DebugMode", "找不到设备: " + deviceId);
            }
        });
    }

    private void toggleDebugMode() {
        if (debugMode) {
            // 退出调试模式
            exitDebugMode();
        } else {
            // 进入调试模式
            enterDebugMode();
        }
    }

    private void enterDebugMode() {
        android.util.Log.d("DebugMode", "enterDebugMode 被调用");
        debugMode = true;
        btnDebugMode.setImageResource(android.R.drawable.ic_menu_close_clear_cancel);
        btnDebugMode.setBackgroundTintList(android.content.res.ColorStateList.valueOf(0xFFFF9800)); // 橙色
        cardDebugIndicator.setVisibility(View.VISIBLE);

        // 设置渲染器为调试模式
        if (deviceRenderer != null) {
            android.util.Log.d("DebugMode", "设置 deviceRenderer 为调试模式");
            deviceRenderer.setDebugMode(true);
        } else {
            android.util.Log.e("DebugMode", "deviceRenderer 为 null!");
        }

        // 重新渲染设备（使标记可拖动）
        redrawAll();

        toast("调试模式已开启，可以拖动设备标记调整位置");
    }

    private void exitDebugMode() {
        debugMode = false;
        btnDebugMode.setImageResource(android.R.drawable.ic_menu_compass);
        btnDebugMode.setBackgroundTintList(android.content.res.ColorStateList.valueOf(0xFF3F51B5)); // 蓝色
        cardDebugIndicator.setVisibility(View.GONE);

        // 设置渲染器为非调试模式
        deviceRenderer.setDebugMode(false);

        // 保存所有手动调整的位置到后端，并在保存完成后刷新设备列表
        saveManualPositionsAndRefresh();

        toast("调试模式已退出，设备位置已保存");
    }

    private void saveManualPositionsAndRefresh() {
        if (manualPositions.isEmpty()) {
            // 没有手动调整的位置，直接刷新
            refreshDevicesFromServer();
            return;
        }

        final int[] completedCount = {0};
        final int totalCount = manualPositions.size();

        android.util.Log.d("DebugMode", "开始保存 " + totalCount + " 个设备位置到后端");

        for (Map.Entry<String, DevicePosition> entry : manualPositions.entrySet()) {
            String deviceId = entry.getKey();
            DevicePosition pos = entry.getValue();

            android.util.Log.d("DebugMode", "保存设备位置: " + deviceId + " -> (" + pos.lat + ", " + pos.lng + ")");

            DeviceApi.DevicePositionUpdateRequest request =
                    new DeviceApi.DevicePositionUpdateRequest(deviceId, pos.lat, pos.lng);

            deviceApi.updateDevicePosition(request).enqueue(new Callback<JsonObject>() {
                @Override
                public void onResponse(Call<JsonObject> call, Response<JsonObject> response) {
                    if (response.isSuccessful()) {
                        android.util.Log.d("DebugMode", "设备位置保存成功: " + deviceId + ", 响应: " + response.body());
                    } else {
                        android.util.Log.e("DebugMode", "设备位置保存失败: " + deviceId + ", 状态码: " + response.code() + ", 错误: " + response.errorBody());
                    }
                    checkAllCompleted();
                }

                @Override
                public void onFailure(Call<JsonObject> call, Throwable t) {
                    android.util.Log.e("DebugMode", "设备位置保存异常: " + deviceId, t);
                    checkAllCompleted();
                }

                private void checkAllCompleted() {
                    completedCount[0]++;
                    android.util.Log.d("DebugMode", "保存进度: " + completedCount[0] + "/" + totalCount);
                    if (completedCount[0] >= totalCount) {
                        // 所有保存请求完成，清空记录并刷新设备列表
                        android.util.Log.d("DebugMode", "所有设备位置保存完成，准备刷新设备列表");
                        manualPositions.clear();
                        refreshDevicesFromServer();
                    }
                }
            });
        }
    }

    private void refreshDevicesFromServer() {
        deviceRepo.loadDevices(new DeviceRepository.DataCallback<List<DeviceItem>>() {
            @Override
            public void onSuccess(List<DeviceItem> deviceList) {
                runOnUiThread(() -> {
                    devices.clear();
                    devices.addAll(deviceList);
                    redrawAll();
                    android.util.Log.d("DebugMode", "设备列表已刷新，共 " + deviceList.size() + " 个设备");
                });
            }

            @Override
            public void onError(String error) {
                android.util.Log.e("DebugMode", "刷新设备列表失败: " + error);
                // 即使刷新失败，也重新渲染当前设备列表
                runOnUiThread(() -> redrawAll());
            }
        });
    }

    private DeviceItem findDeviceById(String deviceId) {
        for (DeviceItem device : devices) {
            if (deviceId.equals(device.deviceId)) {
                return device;
            }
        }
        return null;
    }

    // -------------------------
    // Add / Edit Mode
    // -------------------------
    private void enterAddMode() {
        addMode = true;
        editMode = false;
        editingFenceId = null;
        editingOrigin = null;

        panelAdd.setVisibility(View.VISIBLE);
        panelList.setVisibility(View.GONE);

        etName.setText("");
        rbCircle.setChecked(true);

        circleRadius = 50;
        suppressUiSync = true;
        etRadius.setText(String.valueOf((int) circleRadius));
        sbRadius.setProgress((int) circleRadius);
        suppressUiSync = false;

        spTriggerType.setSelection(0);
        swEnable.setChecked(true);

        updateShapeUi();
        clearDraftOnly();
        redrawAll();

        toast("新增模式：点击地图选圆心/多边形模式下点击加点绘制");
    }

    private void enterEditMode(@NonNull UiFence f) {
        if (f.id == null) {
            toast("该围栏没有id，无法编辑");
            return;
        }

        addMode = true;
        editMode = true;
        editingFenceId = f.id != null ? String.valueOf(f.id) : null;
        editingOrigin = f;

        panelAdd.setVisibility(View.VISIBLE);
        panelList.setVisibility(View.GONE);

        etName.setText(f.name == null ? "" : f.name);

        String beh = (f.ruleType == null) ? BEHAVIOR_NO_ENTRY : f.ruleType;
        if (BEHAVIOR_NO_EXIT.equalsIgnoreCase(beh)) spTriggerType.setSelection(1);
        else spTriggerType.setSelection(0);
        swEnable.setChecked(f.enabled == null || f.enabled);

        clearDraftOnly();

        if ("POLYGON".equalsIgnoreCase(f.shapeType)) {
            rbPolygon.setChecked(true);
            updateShapeUi();

            polygonPoints.clear();
            if (f.points != null) {
                for (double[] p : f.points) {
                    if (p == null || p.length < 2) continue;
                    polygonPoints.add(new LatLng(p[0], p[1]));
                }
            }
            redrawAll();
            focusFenceOnMap(f);

        } else {
            rbCircle.setChecked(true);
            updateShapeUi();

            LatLng c = f.getBestCenterLatLng();
            circleCenter = c;

            circleRadius = (f.radiusMeters != null) ? f.radiusMeters : 50.0;
            suppressUiSync = true;
            etRadius.setText(String.valueOf((int) Math.round(circleRadius)));
            sbRadius.setProgress(clamp((int) Math.round(circleRadius), 5, 20000));
            suppressUiSync = false;

            redrawAll();
            focusFenceOnMap(f);
        }

        toast("编辑模式：修改后点保存即可更新");
    }

    private void exitAddOrEditMode() {
        addMode = false;
        editMode = false;
        editingFenceId = null;
        editingOrigin = null;

        panelAdd.setVisibility(View.GONE);
        clearDraftOnly();
        redrawAll();
    }

    private boolean isCircleMode() { return rbCircle != null && rbCircle.isChecked(); }
    private boolean isPolygonMode() { return rbPolygon != null && rbPolygon.isChecked(); }

    private void updateShapeUi() {
        if (isCircleMode()) {
            groupCircle.setVisibility(View.VISIBLE);
            groupPolygon.setVisibility(View.GONE);
        } else {
            groupCircle.setVisibility(View.GONE);
            groupPolygon.setVisibility(View.VISIBLE);
        }
    }

    // -------------------------
    // Draft - Circle
    // -------------------------
    private void setCircleCenter(LatLng center) {
        circleCenter = center;
        ensureCirclePreviewObjects();
        updateCirclePreviewGeometry();
    }

    private void ensureCirclePreviewObjects() {
        if (!addMode || !isCircleMode()) return;
        if (aMap == null || circleCenter == null) return;

        if (circleCenterMarker == null) {
            circleCenterMarker = aMap.addMarker(new MarkerOptions()
                    .position(circleCenter)
                    .title("圆心"));
        }
        if (previewCircle == null) {
            previewCircle = aMap.addCircle(new CircleOptions()
                    .center(circleCenter)
                    .radius(circleRadius)
                    .strokeWidth(6f)
                    .strokeColor(0xFFE53935)
                    .fillColor(0x22E53935)); // 半透明填充更好�?
        }
        if (radiusHandleMarker == null) {
            radiusHandleMarker = aMap.addMarker(new MarkerOptions()
                    .position(offsetEast(circleCenter, circleRadius))
                    .draggable(true)
                    .title("拖拽调半径"));
        }
    }

    private void updateCirclePreviewGeometry() {
        if (!addMode || !isCircleMode()) return;
        if (circleCenter == null) return;

        ensureCirclePreviewObjects();

        if (circleCenterMarker != null) circleCenterMarker.setPosition(circleCenter);
        if (previewCircle != null) {
            previewCircle.setCenter(circleCenter);
            previewCircle.setRadius(circleRadius);
        }
        if (radiusHandleMarker != null) {
            radiusHandleMarker.setPosition(offsetEast(circleCenter, circleRadius));
        }
    }

    private void applyRadiusFromEditText() {
        if (suppressUiSync) return;
        String s = etRadius.getText().toString().trim();
        if (TextUtils.isEmpty(s)) return;
        try {
            double r = Double.parseDouble(s);
            r = Math.max(5, Math.min(20000, r));
            circleRadius = r;
            syncRadiusUiFromValue();
            updateCirclePreviewGeometry();
        } catch (Exception ignored) {}
    }

    private void syncRadiusUiFromValue() {
        if (suppressUiSync) return;
        suppressUiSync = true;
        etRadius.setText(String.valueOf((int) Math.round(circleRadius)));
        sbRadius.setProgress(clamp((int) Math.round(circleRadius), 5, 20000));
        suppressUiSync = false;
    }

    private LatLng offsetEast(LatLng center, double meters) {
        double dLng = meters / (EARTH_RADIUS * Math.cos(Math.toRadians(center.latitude)));
        dLng = Math.toDegrees(dLng);
        return new LatLng(center.latitude, center.longitude + dLng);
    }

    // -------------------------
    // Draft - Polygon
    // -------------------------
    private void addPolygonPoint(LatLng p) {
        if (!addMode || !isPolygonMode()) return;
        if (aMap == null || p == null) return;

        polygonPoints.add(p);
        Marker m = aMap.addMarker(new MarkerOptions().position(p).title("点" + polygonPoints.size()));
        polygonPointMarkers.add(m);

        redrawPolygonPreviewLine();
    }

    private void undoPolygonPoint() {
        if (!addMode || !isPolygonMode()) return;
        if (polygonPoints.isEmpty()) return;

        polygonPoints.remove(polygonPoints.size() - 1);

        if (!polygonPointMarkers.isEmpty()) {
            Marker m = polygonPointMarkers.remove(polygonPointMarkers.size() - 1);
            if (m != null) m.remove();
        }

        redrawPolygonPreviewLine();
    }

    private void clearPolygonDraft() {
        polygonPoints.clear();

        for (Marker m : polygonPointMarkers) {
            if (m != null) m.remove();
        }
        polygonPointMarkers.clear();

        if (polygonPreviewLine != null) {
            polygonPreviewLine.remove();
            polygonPreviewLine = null;
        }
    }

    private void redrawPolygonPreviewLine() {
        if (!addMode || !isPolygonMode()) return;
        if (aMap == null) return;

        if (polygonPreviewLine != null) {
            polygonPreviewLine.remove();
            polygonPreviewLine = null;
        }

        if (polygonPoints.size() < 2) return;

        List<LatLng> pts = new ArrayList<>(polygonPoints);
        if (pts.size() >= 3) pts.add(pts.get(0));

        polygonPreviewLine = aMap.addPolyline(new PolylineOptions()
                .addAll(pts)
                .width(6f)
                .color(0xFF1E88E5));
    }

    private void clearDraftOnly() {
        circleCenter = null;
        if (circleCenterMarker != null) { circleCenterMarker.remove(); circleCenterMarker = null; }
        if (radiusHandleMarker != null) { radiusHandleMarker.remove(); radiusHandleMarker = null; }
        if (previewCircle != null) { previewCircle.remove(); previewCircle = null; }

        clearPolygonDraft();
    }

    // -------------------------
    // Backend
    // -------------------------
    private void refreshFromServer() {
        api.getFences().enqueue(new Callback<JsonArray>() {
            @Override
            public void onResponse(@NonNull Call<JsonArray> call, @NonNull Response<JsonArray> resp) {
                if (!resp.isSuccessful() || resp.body() == null) {
                    toast("拉取围栏失败 HTTP " + resp.code());
                    return;
                }
                fences.clear();
                for (JsonElement e : resp.body()) {
                    if (e != null && e.isJsonObject()) fences.add(UiFence.fromJson(e.getAsJsonObject()));
                }
                fenceAdapter.notifyDataSetChanged();
                redrawAll();
            }

            @Override
            public void onFailure(@NonNull Call<JsonArray> call, @NonNull Throwable t) {
                toast("拉取围栏失败: " + (t == null ? "unknown" : t.getMessage()));
            }
        });

        api.getRegions().enqueue(new Callback<JsonArray>() {
            @Override
            public void onResponse(@NonNull Call<JsonArray> call, @NonNull Response<JsonArray> resp) {
                if (!resp.isSuccessful() || resp.body() == null) return;
                regions.clear();
                for (JsonElement e : resp.body()) {
                    if (e != null && e.isJsonObject()) regions.add(UiRegion.fromJson(e.getAsJsonObject()));
                }
                redrawAll();
            }

            @Override public void onFailure(@NonNull Call<JsonArray> call, @NonNull Throwable t) {}
        });

        // 加载设备数据
        deviceRepo.loadDevices(new DeviceRepository.DataCallback<List<DeviceItem>>() {
            @Override
            public void onSuccess(List<DeviceItem> data) {
                devices.clear();
                devices.addAll(data);
                redrawAll();
            }

            @Override
            public void onError(String msg) {
                // 静默失败，不影响围栏显示
            }
        });

        // 获取待处理的围栏报警
        fetchPendingFenceAlarms();
    }

    /**
     * 获取待处理的围栏报警，更新设备违规状态
     */
    private void fetchPendingFenceAlarms() {
        if (alarmApi == null) return;

        alarmApi.getAlarms().enqueue(new Callback<List<Alarm>>() {
            @Override
            public void onResponse(@NonNull Call<List<Alarm>> call, @NonNull Response<List<Alarm>> resp) {
                if (!resp.isSuccessful() || resp.body() == null) {
                    android.util.Log.w("FenceCenter", "获取报警失败: HTTP " + resp.code());
                    return;
                }

                List<Alarm> alarms = resp.body();
                Map<String, String> newViolations = new HashMap<>();

                for (Alarm alarm : alarms) {
                    if (alarm == null) continue;

                    String status = alarm.getStatus() != null ? alarm.getStatus().toLowerCase() : "";
                    String alarmType = alarm.getAlarmType() != null ? alarm.getAlarmType() : "";
                    String deviceId = alarm.getDeviceId();
                    Long fenceId = alarm.getFenceId();

                    // 只处理待处理的围栏报警
                    boolean isPending = !"resolved".equals(status) && !"ignored".equals(status);
                    boolean isFenceAlarm = fenceId != null || alarmType.contains("电子围栏");

                    if (isPending && isFenceAlarm && deviceId != null && !deviceId.isEmpty()) {
                        String violationType = alarmType.contains("闯入") ? "No Entry" : "No Exit";
                        newViolations.put(deviceId, violationType);
                    }
                }

                // 检查违规状态是否发生变化
                boolean hasChanged;
                synchronized (deviceViolations) {
                    hasChanged = !deviceViolations.equals(newViolations);
                    if (hasChanged) {
                        deviceViolations.clear();
                        deviceViolations.putAll(newViolations);
                    }
                }

                // 只有在违规状态发生变化时才重绘
                if (hasChanged) {
                    runOnUiThread(() -> {
                        android.util.Log.d("FenceCenter", "违规状态变化，重绘地图。违规设备数量: " + deviceViolations.size());
                        redrawAll();
                    });
                }
            }

            @Override
            public void onFailure(@NonNull Call<List<Alarm>> call, @NonNull Throwable t) {
                android.util.Log.w("FenceCenter", "获取报警失败: " + t.getMessage());
            }
        });
    }

    /**
     * 启动报警轮询
     */
    private void startAlarmPolling() {
        if (alarmPollingExecutor != null && !alarmPollingExecutor.isShutdown()) {
            return;
        }
        alarmPollingExecutor = Executors.newSingleThreadScheduledExecutor();
        alarmPollingExecutor.scheduleAtFixedRate(this::fetchPendingFenceAlarms, 1, 1, TimeUnit.SECONDS);
        android.util.Log.d("FenceCenter", "启动报警轮询");
    }

    /**
     * 停止报警轮询
     */
    private void stopAlarmPolling() {
        if (alarmPollingExecutor != null) {
            alarmPollingExecutor.shutdown();
            alarmPollingExecutor = null;
            android.util.Log.d("FenceCenter", "停止报警轮询");
        }
    }

    private void saveFenceToServer() {
        String name = etName.getText().toString().trim();
        if (TextUtils.isEmpty(name)) {
            toast("请输入围栏名称");
            return;
        }

        UiFence draft = new UiFence();
        draft.name = name;
        draft.shapeType = isCircleMode() ? "CIRCLE" : "POLYGON";
        draft.ruleType = getBehaviorFromSpinner();
        draft.enabled = swEnable != null && swEnable.isChecked();

        if (editMode && editingOrigin != null) {
            draft.level = editingOrigin.level;
            draft.effectiveTime = editingOrigin.effectiveTime;
            draft.remark = editingOrigin.remark;
        }

        if ("CIRCLE".equalsIgnoreCase(draft.shapeType)) {
            if (circleCenter == null) {
                toast("请在地图上点击选择圆心");
                return;
            }
            applyRadiusFromEditText();
            draft.lat = circleCenter.latitude;
            draft.lng = circleCenter.longitude;
            draft.radiusMeters = circleRadius;

        } else {
            if (polygonPoints == null || polygonPoints.size() < 3) {
                toast("多边形至少需要 3 个点");
                return;
            }
            draft.points = new ArrayList<>();
            for (LatLng p : polygonPoints) {
                if (p == null) continue;
                double[] point = new double[]{p.latitude, p.longitude};
                draft.points.add(point);
            }
            if (draft.points.size() < 3) {
                toast("多边形点无效，请重新绘制");
                return;
            }
        }

        if (draft.ruleType == null || draft.ruleType.trim().isEmpty()) draft.ruleType = BEHAVIOR_NO_ENTRY;
        if (draft.level == null || draft.level.trim().isEmpty()) draft.level = "normal";
        if (draft.effectiveTime == null || draft.effectiveTime.trim().isEmpty()) draft.effectiveTime = "00:00-23:59";
        if (draft.remark == null) draft.remark = "";

        JsonObject body = draft.toCreateBody();

        if (editMode && editingFenceId != null) {
            api.updateFence(editingFenceId, body).enqueue(new Callback<JsonObject>() {
                @Override
                public void onResponse(@NonNull Call<JsonObject> call, @NonNull Response<JsonObject> resp) {
                    if (!resp.isSuccessful()) {
                        toast("更新失败 HTTP " + resp.code());
                        return;
                    }
                    toast("更新成功");
                    exitAddOrEditMode();
                    refreshFromServer();
                }

                @Override
                public void onFailure(@NonNull Call<JsonObject> call, @NonNull Throwable t) {
                    toast("更新失败: " + (t == null ? "unknown" : t.getMessage()));
                }
            });
        } else {
            api.createFence(body).enqueue(new Callback<JsonObject>() {
                @Override
                public void onResponse(@NonNull Call<JsonObject> call, @NonNull Response<JsonObject> resp) {
                    if (!resp.isSuccessful()) {
                        toast("保存失败 HTTP " + resp.code());
                        return;
                    }
                    toast("保存成功");
                    exitAddOrEditMode();
                    refreshFromServer();
                }

                @Override
                public void onFailure(@NonNull Call<JsonObject> call, @NonNull Throwable t) {
                    toast("保存失败: " + (t == null ? "unknown" : t.getMessage()));
                }
            });
        }
    }

    private String getBehaviorFromSpinner() {
        if (spTriggerType == null) return BEHAVIOR_NO_ENTRY;
        int idx = spTriggerType.getSelectedItemPosition();
        return (idx == 1) ? BEHAVIOR_NO_EXIT : BEHAVIOR_NO_ENTRY;
    }

    private void confirmDeleteFence(UiFence fence) {
        if (fence == null || fence.id == null) return;
        new AlertDialog.Builder(this)
                .setTitle("删除围栏")
                .setMessage("确定删除「" + (fence.name == null ? "" : fence.name) + "」吗？")
                .setNegativeButton("取消", null)
                .setPositiveButton("删除", (d, w) -> deleteFenceFromServer(fence))
                .show();
    }

    private void deleteFenceFromServer(UiFence fence) {
        if (fence == null || fence.id == null) return;
        api.deleteFence(String.valueOf(fence.id)).enqueue(new Callback<JsonObject>() {
            @Override
            public void onResponse(@NonNull Call<JsonObject> call, @NonNull Response<JsonObject> resp) {
                if (!resp.isSuccessful()) {
                    toast("删除失败 HTTP " + resp.code());
                    return;
                }
                toast("已删除");
                refreshFromServer();
            }

            @Override
            public void onFailure(@NonNull Call<JsonObject> call, @NonNull Throwable t) {
                toast("删除失败: " + (t == null ? "unknown" : t.getMessage()));
            }
        });
    }

    // �?列表开关：直接更新 is_active（保留原几何/字段�?
    private void toggleFenceEnable(@NonNull UiFence fence, boolean newEnabled) {
        if (fence.id == null) return;

        boolean old = fence.enabled != null && fence.enabled;
        fence.enabled = newEnabled;
        fenceAdapter.notifyDataSetChanged();
        redrawAll();

        // 用当�?fence 生成 update body（字段不丢）
        // 圆如�?lat/lng 为空，用 best center 补齐一�?
        LatLng c = fence.getBestCenterLatLng();
        if (c != null) { fence.lat = c.latitude; fence.lng = c.longitude; }

        JsonObject body = fence.buildFenceCreateBody();

        api.updateFence(String.valueOf(fence.id), body).enqueue(new Callback<JsonObject>() {
            @Override
            public void onResponse(@NonNull Call<JsonObject> call, @NonNull Response<JsonObject> resp) {
                if (!resp.isSuccessful()) {
                    fence.enabled = old; // 回滚
                    fenceAdapter.notifyDataSetChanged();
                    redrawAll();
                    toast("启用状态更新失败 HTTP " + resp.code());
                    return;
                }
                toast(newEnabled ? "已启用" : "已停用");
            }

            @Override
            public void onFailure(@NonNull Call<JsonObject> call, @NonNull Throwable t) {
                fence.enabled = old; // 回滚
                fenceAdapter.notifyDataSetChanged();
                redrawAll();
                toast("启用状态更新失败 " + (t == null ? "unknown" : t.getMessage()));
            }
        });
    }

    // -------------------------
    // List item actions
    // -------------------------
    private void showFenceActions(UiFence f) {
        if (f == null) return;
        String[] items = new String[]{"定位到地图", "编辑", "删除"};
        new AlertDialog.Builder(this)
                .setTitle(f.name == null ? "围栏" : f.name)
                .setItems(items, (d, which) -> {
                    if (which == 0) focusFenceOnMap(f);
                    else if (which == 1) enterEditMode(f);
                    else if (which == 2) confirmDeleteFence(f);
                })
                .show();
    }

    // -------------------------
    // Map Draw
    // -------------------------
    private void redrawAll() {
        if (aMap == null) return;

        aMap.clear();

        // 1) regions（线框）
        for (UiRegion r : regions) {
            if (r == null || r.points == null || r.points.size() < 3) continue;
            List<LatLng> pts = new ArrayList<>();
            for (double[] p : r.points) {
                if (p == null || p.length < 2) continue;
                pts.add(new LatLng(p[0], p[1]));
            }
            if (pts.size() < 3) continue;
            pts.add(pts.get(0));
            aMap.addPolyline(new PolylineOptions()
                    .addAll(pts)
                    .width(4f)
                    .color(0xFF43A047));
        }

        // 2) fences（编辑态跳过正在编辑的围栏�?
        for (UiFence f : fences) {
            if (f == null) continue;
            if (editMode && editingFenceId != null && f.id != null && editingFenceId.equals(String.valueOf(f.id))) continue;

            boolean enabled = (f.enabled == null) || f.enabled;
            int strokeColor;
            int fillColor;

            // 颜色：启�?禁用 + 行为区分
            String beh = (f.ruleType == null) ? BEHAVIOR_NO_ENTRY : f.ruleType;
            if (!enabled) {
                strokeColor = 0xFF9E9E9E;
                fillColor = 0x159E9E9E;
            } else if (BEHAVIOR_NO_EXIT.equalsIgnoreCase(beh)) {
                strokeColor = 0xFFFF9800; // 橙：禁出
                fillColor = 0x22FF9800;
            } else {
                strokeColor = 0xFFE53935; // 红：禁入
                fillColor = 0x22E53935;
            }

            LatLng centerLatLng = null;

            if ("POLYGON".equalsIgnoreCase(f.shapeType)) {
                if (f.points == null || f.points.size() < 3) continue;

                List<LatLng> pts = new ArrayList<>();
                for (double[] p : f.points) {
                    if (p == null || p.length < 2) continue;
                    pts.add(new LatLng(p[0], p[1]));
                }
                if (pts.size() < 3) continue;

                aMap.addPolygon(new PolygonOptions()
                        .addAll(pts)
                        .strokeWidth(6f)
                        .strokeColor(strokeColor)
                        .fillColor(fillColor));

                // 计算多边形中心点
                centerLatLng = calculatePolygonCenter(pts);

            } else {
                LatLng c = f.getBestCenterLatLng();
                if (c == null) continue;

                Double r = f.radiusMeters;
                if (r == null) r = 50.0;

                aMap.addCircle(new CircleOptions()
                        .center(c)
                        .radius(r)
                        .strokeWidth(5f)
                        .strokeColor(strokeColor)
                        .fillColor(fillColor));

                centerLatLng = c;
            }

            // 在围栏中心显示围栏名�?
            if (centerLatLng != null && f.name != null && !f.name.trim().isEmpty()) {
                addFenceNameMarker(centerLatLng, f.name, strokeColor);
            }
        }

        // 3) 我的位置 marker
        myLocationMarker = null;
        if (lastMyLocation != null) {
            myLocationMarker = aMap.addMarker(new MarkerOptions()
                    .position(lastMyLocation)
                    .title("当前位置"));
        }

        // 4) 草稿
        if (addMode) {
            if (isCircleMode()) {
                if (circleCenter != null) {
                    ensureCirclePreviewObjects();
                    updateCirclePreviewGeometry();
                }
            } else {
                for (Marker m : polygonPointMarkers) if (m != null) m.remove();
                polygonPointMarkers.clear();
                for (int i = 0; i < polygonPoints.size(); i++) {
                    LatLng p = polygonPoints.get(i);
                    if (p == null) continue;
                    Marker m = aMap.addMarker(new MarkerOptions().position(p).title("点" + (i + 1)));
                    polygonPointMarkers.add(m);
                }
                redrawPolygonPreviewLine();
            }
        }

        // 5) 渲染设备（违规状态由后端提供）
        drawDevices();

        zoomToOverlaysIfFirstLoad();
    }

    private void drawDevices() {
        if (aMap == null || deviceRenderer == null) return;

        // 使用 DeviceMapRenderer 渲染设备，传入违规状态
        synchronized (deviceViolations) {
            deviceRenderer.renderDevices(devices, deviceViolations);
        }
    }

    private void zoomToOverlaysIfFirstLoad() {
        if (firstServerRenderDone) return;
        if (aMap == null) return;

        LatLngBounds.Builder b = new LatLngBounds.Builder();
        boolean has = false;

        for (UiRegion r : regions) {
            if (r == null || r.points == null) continue;
            for (double[] p : r.points) {
                if (p == null || p.length < 2) continue;
                b.include(new LatLng(p[0], p[1]));
                has = true;
            }
        }

        for (UiFence f : fences) {
            if (f == null) continue;
            if (f.points != null) {
                for (double[] p : f.points) {
                    if (p == null || p.length < 2) continue;
                    b.include(new LatLng(p[0], p[1]));
                    has = true;
                }
            }
            LatLng c = f.getBestCenterLatLng();
            if (c != null) {
                b.include(c);
                has = true;
            }
        }

        for (DeviceItem d : devices) {
            if (d == null || !d.hasLocation()) continue;
            b.include(new LatLng(d.lat, d.lng));
            has = true;
        }

        if (has) {
            try { aMap.animateCamera(CameraUpdateFactory.newLatLngBounds(b.build(), 120)); }
            catch (Exception ignore) {}
        }
        firstServerRenderDone = true;
    }

    private void focusFenceOnMap(UiFence f) {
        if (aMap == null || f == null) return;

        if ("POLYGON".equalsIgnoreCase(f.shapeType) && f.points != null && !f.points.isEmpty()) {
            double[] p = f.points.get(0);
            if (p != null && p.length >= 2) {
                aMap.animateCamera(CameraUpdateFactory.newLatLngZoom(new LatLng(p[0], p[1]), 16f));
            }
            return;
        }

        LatLng c = f.getBestCenterLatLng();
        if (c != null) {
            aMap.animateCamera(CameraUpdateFactory.newLatLngZoom(c, 16f));
            return;
        }
    }

    // -------------------------
    // List switching
    // -------------------------
    private void showFenceList() {
        tvListTitle.setText("围栏列表");
        rvFence.setVisibility(View.VISIBLE);
        rvDevice.setVisibility(View.GONE);
        btnTabFence.setEnabled(false);
        btnTabDevice.setEnabled(true);
        fenceAdapter.notifyDataSetChanged();
    }

    private void showDeviceList() {
        tvListTitle.setText("设备列表");
        rvFence.setVisibility(View.GONE);
        rvDevice.setVisibility(View.VISIBLE);
        btnTabFence.setEnabled(true);
        btnTabDevice.setEnabled(false);
        deviceAdapter.notifyDataSetChanged();
    }

    // -------------------------
    // Device actions
    // -------------------------
    private void focusOnDevice(DeviceItem device) {
        if (aMap == null || device == null || !device.hasLocation()) return;

        // 关闭列表面板
        panelList.setVisibility(View.GONE);

        // 定位到设�?
        LatLng position = new LatLng(device.lat, device.lng);
        aMap.animateCamera(CameraUpdateFactory.newLatLngZoom(position, 18f));

        // 显示设备信息窗口
        if (deviceRenderer != null) {
            deviceRenderer.showInfoWindow(device);
        }
    }

    private void showDeviceActions(DeviceItem device) {
        if (device == null) return;
        String[] items = new String[]{"定位到地图", "查看详情"};
        new AlertDialog.Builder(this)
                .setTitle(device.name != null ? device.name : "设备")
                .setItems(items, (d, which) -> {
                    if (which == 0) focusOnDevice(device);
                    else {
                        // 显示设备详情
                        StringBuilder msg = new StringBuilder();
                        msg.append("设备ID: ").append(device.deviceId != null ? device.deviceId : "未知").append("\n");
                        msg.append("名称: ").append(device.name != null ? device.name : "未命名").append("\n");
                        msg.append("状态: ").append(device.isOnline() ? "在线" : "离线").append("\n");
                        if (device.holder != null) msg.append("持有人: ").append(device.holder).append("\n");
                        if (device.holderPhone != null) msg.append("电话: ").append(device.holderPhone).append("\n");
                        if (device.company != null) msg.append("公司: ").append(device.company).append("\n");
                        if (device.project != null) msg.append("项目: ").append(device.project).append("\n");
                        if (device.hasLocation()) {
                            msg.append("位置: ").append(String.format("%.6f, %.6f", device.lat, device.lng));
                        }
                        new AlertDialog.Builder(this)
                                .setTitle("设备详情")
                                .setMessage(msg.toString())
                                .setPositiveButton("确定", null)
                                .show();
                    }
                })
                .show();
    }

    // 计算多边形中心点（质心）
    private LatLng calculatePolygonCenter(List<LatLng> points) {
        if (points == null || points.isEmpty()) return null;
        if (points.size() == 1) return points.get(0);

        double sumLat = 0, sumLng = 0;
        for (LatLng p : points) {
            sumLat += p.latitude;
            sumLng += p.longitude;
        }
        return new LatLng(sumLat / points.size(), sumLng / points.size());
    }

    // 在围栏中心添加名称标�?
    private void addFenceNameMarker(LatLng position, String name, int color) {
        if (aMap == null || position == null || name == null) return;

        // 创建文字 Marker
        TextView textView = new TextView(this);
        textView.setText(name);
        textView.setTextSize(12);
        textView.setTextColor(0xFF000000); // 黑色文字
        textView.setBackgroundColor(0xFFFFFFFF); // 白色背景
        textView.setPadding(8, 4, 8, 4);

        // �?TextView 转为 Bitmap
        Bitmap bitmap = convertViewToBitmap(textView);

        MarkerOptions markerOptions = new MarkerOptions()
                .position(position)
                .icon(BitmapDescriptorFactory.fromBitmap(bitmap))
                .anchor(0.5f, 0.5f) // 居中显示
                .setFlat(true); // 随地图旋�?

        aMap.addMarker(markerOptions);
    }

    // �?View 转换�?Bitmap
    private Bitmap convertViewToBitmap(View view) {
        view.measure(View.MeasureSpec.makeMeasureSpec(0, View.MeasureSpec.UNSPECIFIED),
                View.MeasureSpec.makeMeasureSpec(0, View.MeasureSpec.UNSPECIFIED));
        view.layout(0, 0, view.getMeasuredWidth(), view.getMeasuredHeight());
        Bitmap bitmap = Bitmap.createBitmap(view.getMeasuredWidth(), view.getMeasuredHeight(), Bitmap.Config.ARGB_8888);
        Canvas canvas = new Canvas(bitmap);
        view.draw(canvas);
        return bitmap;
    }

    // -------------------------
    // Locate
    // -------------------------
    private void ensurePermissionThenLocate() {
        boolean fine = ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION)
                == PackageManager.PERMISSION_GRANTED;
        boolean coarse = ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_COARSE_LOCATION)
                == PackageManager.PERMISSION_GRANTED;

        if (fine || coarse) {
            enableMapMyLocationAndMove();
        } else {
            ActivityCompat.requestPermissions(this,
                    new String[]{Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION},
                    REQ_LOCATION);
        }
    }

    private void enableMapMyLocationAndMove() {
        if (aMap == null) return;

        MyLocationStyle style = new MyLocationStyle();
        style.myLocationType(MyLocationStyle.LOCATION_TYPE_LOCATE);
        aMap.setMyLocationStyle(style);
        aMap.getUiSettings().setMyLocationButtonEnabled(false);
        aMap.setMyLocationEnabled(true);

        if (lastMyLocation != null) {
            aMap.animateCamera(CameraUpdateFactory.newLatLngZoom(lastMyLocation, 16f));
        } else {
            toast("正在获取定位，请稍后再点一次");
        }
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, @NonNull String[] permissions, @NonNull int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode != REQ_LOCATION) return;

        boolean granted = false;
        for (int r : grantResults) {
            if (r == PackageManager.PERMISSION_GRANTED) { granted = true; break; }
        }
        if (granted) enableMapMyLocationAndMove();
        else toast("未授予定位权限");
    }

    // -------------------------
    // Utils
    // -------------------------
    private void toast(String s) {
        Toast.makeText(this, s, Toast.LENGTH_SHORT).show();
    }

    private int clamp(int v, int lo, int hi) {
        return Math.max(lo, Math.min(hi, v));
    }

    // -------------------------
    // MapView lifecycle
    // -------------------------
    @Override protected void onResume() {
        super.onResume();
        mapView.onResume();
        refreshFromServer();
        startAlarmPolling();
    }

    @Override protected void onPause() {
        super.onPause();
        mapView.onPause();
        stopAlarmPolling();
    }

    @Override protected void onDestroy() {
        super.onDestroy();
        stopAlarmPolling();
        mapView.onDestroy();
    }

    @Override protected void onSaveInstanceState(@NonNull Bundle outState) {
        super.onSaveInstanceState(outState);
        mapView.onSaveInstanceState(outState);
    }

    // -------------------------
    // �?新的列表 Adapter（使�?item_fence.xml�?
    // -------------------------
    static class FenceListAdapter extends RecyclerView.Adapter<FenceListAdapter.VH> {

        interface OnClick { void onClick(UiFence f); }
        interface OnToggle { void onToggle(UiFence f, boolean newEnabled); }
        interface OnLong { void onLong(UiFence f); }

        private final List<UiFence> data;
        private final OnClick onClick;
        private final OnToggle onToggle;
        private final OnLong onLong;

        FenceListAdapter(List<UiFence> data, OnClick onClick, OnToggle onToggle, OnLong onLong) {
            this.data = data;
            this.onClick = onClick;
            this.onToggle = onToggle;
            this.onLong = onLong;
        }

        @NonNull @Override
        public VH onCreateViewHolder(@NonNull ViewGroup parent, int viewType) {
            View v = LayoutInflater.from(parent.getContext()).inflate(R.layout.item_fence, parent, false);
            return new VH(v);
        }

        @Override
        public void onBindViewHolder(@NonNull VH h, int pos) {
            UiFence f = data.get(pos);
            String name = (f.name == null || f.name.trim().isEmpty()) ? "未命名围栏" : f.name.trim();
            h.tvName.setText(name);

            String beh = (f.ruleType == null) ? BEHAVIOR_NO_ENTRY : f.ruleType;
            String behText = BEHAVIOR_NO_EXIT.equalsIgnoreCase(beh) ? "禁出" : "禁入";

            boolean enabled = (f.enabled == null) || f.enabled;
            String shapeText = "POLYGON".equalsIgnoreCase(f.shapeType) ? "多边形" : "圆形";

            String desc;
            if ("POLYGON".equalsIgnoreCase(f.shapeType)) {
                int n = (f.points == null) ? 0 : f.points.size();
                desc = String.format(Locale.CHINA, "%s · 点数 %d · %s", shapeText, n, behText);
            } else {
                double r = (f.radiusMeters == null) ? 50.0 : f.radiusMeters;
                desc = String.format(Locale.CHINA, "%s · 半径 %.0fm · %s", shapeText, r, behText);
            }
            h.tvDesc.setText(desc);

            // 开�?
            h.swEnable.setOnCheckedChangeListener(null);
            h.swEnable.setChecked(enabled);
            h.swEnable.setOnCheckedChangeListener((buttonView, isChecked) -> {
                if (onToggle != null) onToggle.onToggle(f, isChecked);
            });

            // 点击 & 箭头
            h.itemView.setOnClickListener(v -> { if (onClick != null) onClick.onClick(f); });
            h.ivArrow.setOnClickListener(v -> { if (onClick != null) onClick.onClick(f); });

            // 长按删除
            h.itemView.setOnLongClickListener(v -> {
                if (onLong != null) onLong.onLong(f);
                return true;
            });
        }

        @Override public int getItemCount() { return data == null ? 0 : data.size(); }

        static class VH extends RecyclerView.ViewHolder {
            TextView tvName, tvDesc;
            SwitchCompat swEnable;
            ImageView ivArrow;

            VH(@NonNull View itemView) {
                super(itemView);
                tvName = itemView.findViewById(R.id.tv_fence_name);
                tvDesc = itemView.findViewById(R.id.tv_fence_desc);
                swEnable = itemView.findViewById(R.id.sw_fence_enable);
                ivArrow = itemView.findViewById(R.id.iv_arrow);
            }
        }
    }

    // -------------------------
    // UI models + 坐标兼容（关键：coordinates_json 默认�?[lng,lat] 解析/生成�?
    // -------------------------
    static class UiFence {
        Integer id;
        String name;

        String shapeType; // "CIRCLE" | "POLYGON"

        Double lat;
        Double lng;
        Double radiusMeters;

        // internal 统一�?[lat,lng]
        List<double[]> points;

        String ruleType;       // behavior
        String level;          // alarm_type
        Boolean enabled;       // is_active

        Integer regionId;      // project_region_id

        String effectiveTime;  // effective_time
        String remark;         // remark

        Integer violationCount = 0;

        static UiFence fromJson(JsonObject o) {
            UiFence f = new UiFence();
            if (o == null) {
                f.points = new ArrayList<>();
                return f;
            }

            // 后端返回�?id 是字符串
            f.id = optIntNullable(o, "id");
            if (f.id == null) {
                String idStr = optString(o, "id");
                if (idStr != null) {
                    try { f.id = Integer.parseInt(idStr); } catch (Exception ignored) {}
                }
            }
            f.name = optString(o, "name");

            // 后端返回 type 字段�?Circle" | "Polygon"）或 shape 字段
            String shape = optString(o, "shape");
            if (shape == null) shape = optString(o, "shapeType");
            if (shape == null) {
                // 后端返回的是 type 字段
                String type = optString(o, "type");
                if (type != null) shape = type;
            }
            if (shape != null) {
                if ("polygon".equalsIgnoreCase(shape) || "Polygon".equals(shape)) f.shapeType = "POLYGON";
                else if ("circle".equalsIgnoreCase(shape) || "Circle".equals(shape)) f.shapeType = "CIRCLE";
                else f.shapeType = shape.toUpperCase();
            } else {
                f.shapeType = "CIRCLE";
            }

            f.regionId = optIntNullable(o, "project_region_id");
            if (f.regionId == null) f.regionId = optIntNullable(o, "regionId");

            f.radiusMeters = optDoubleNullable(o, "radius");
            if (f.radiusMeters == null) f.radiusMeters = optDoubleNullable(o, "radiusMeters");

            // 解析 center 数组 [lat, lng]（后�?GET /fence/list 返回的格式）
            JsonArray centerArr = optJsonArray(o, "center");
            if (centerArr != null && centerArr.size() >= 2) {
                f.lat = centerArr.get(0).getAsDouble();
                f.lng = centerArr.get(1).getAsDouble();
            }
            // 备用字段
            if (f.lat == null) f.lat = optDoubleNullable(o, "lat");
            if (f.lng == null) f.lng = optDoubleNullable(o, "lng");
            if (f.lat == null) f.lat = optDoubleNullable(o, "latitude");
            if (f.lng == null) f.lng = optDoubleNullable(o, "longitude");
            if (f.lat == null) f.lat = optDoubleNullable(o, "center_latitude");
            if (f.lng == null) f.lng = optDoubleNullable(o, "center_longitude");

            // 解析 points 数组 [[lat,lng],...]（后�?GET /fence/list 返回的格式）
            f.points = new ArrayList<>();
            JsonArray pointsArr = optJsonArray(o, "points");
            if (pointsArr != null) {
                for (JsonElement e : pointsArr) {
                    if (!e.isJsonArray()) continue;
                    JsonArray p = e.getAsJsonArray();
                    if (p.size() < 2) continue;
                    double[] point = new double[]{p.get(0).getAsDouble(), p.get(1).getAsDouble()};
                    f.points.add(point);
                }
            }
            // 备用：解�?coordinates_json 字符�?
            if (f.points.isEmpty()) {
                String coords = optString(o, "coordinates_json");
                f.points = parsePointsLngLatToLatLng(coords);
            }

            // 如果是圆形但没有 lat/lng，从 points 取第一个点
            if ("CIRCLE".equalsIgnoreCase(f.shapeType)) {
                if ((f.lat == null || f.lng == null) && !f.points.isEmpty()) {
                    double[] p0 = f.points.get(0);
                    if (p0 != null && p0.length >= 2) {
                        f.lat = p0[0];
                        f.lng = p0[1];
                    }
                }
            }

            f.ruleType = optString(o, "behavior");
            // 后端返回 severity，映射到 level
            String severity = optString(o, "severity");
            if (severity != null) {
                f.level = severity;
            } else {
                f.level = optString(o, "alarm_type");
            }
            f.enabled = optBoolNullable(o, "is_active");
            // 解析 schedule 对象
            JsonObject sched = optJsonObject(o, "schedule");
            if (sched != null) {
                String start = optString(sched, "start");
                String end = optString(sched, "end");
                if (start != null && end != null) {
                    f.effectiveTime = start + "-" + end;
                }
            }
            if (f.effectiveTime == null) {
                f.effectiveTime = optString(o, "effective_time");
            }
            f.remark = optString(o, "remark");

            return f;
        }

        LatLng getBestCenterLatLng() {
            if (lat != null && lng != null) return new LatLng(lat, lng);
            if (points != null && !points.isEmpty()) {
                double[] p0 = points.get(0);
                if (p0 != null && p0.length >= 2) return new LatLng(p0[0], p0[1]);
            }
            return null;
        }

        // 转换为后�?POST /fence/ 新格式请求体
        JsonObject toCreateBody() {
            JsonObject body = new JsonObject();

            body.addProperty("name", (name == null || name.trim().isEmpty()) ? "未命名围栏" : name.trim());
            body.addProperty("project_region_id", (regionId != null) ? regionId : (Integer) null);

            String shape = (shapeType == null) ? "circle" : shapeType.toLowerCase();
            body.addProperty("shape", shape);

            body.addProperty("behavior", (ruleType == null || ruleType.trim().isEmpty()) ? BEHAVIOR_NO_ENTRY : ruleType);

            // effective_time 字符�?"HH:mm-HH:mm"
            String time = (effectiveTime == null || effectiveTime.trim().isEmpty()) ? "00:00-23:59" : effectiveTime;
            body.addProperty("effective_time", time);

            body.addProperty("remark", (remark != null) ? remark : "");

            // level/severity 映射�?alarm_type
            String sev = (level == null || level.trim().isEmpty()) ? "normal" : level;
            if ("risk".equalsIgnoreCase(sev)) body.addProperty("alarm_type", "medium");
            else if ("severe".equalsIgnoreCase(sev)) body.addProperty("alarm_type", "high");
            else body.addProperty("alarm_type", "low");

            body.addProperty("is_active", (enabled != null && enabled) ? 1 : 0);

            // coordinates_json - 后端期望 JSON 字符串，不是数组对象
            String coordsJsonStr;
            if ("circle".equalsIgnoreCase(shape) && lat != null && lng != null) {
                // 圆形：中心点 [[lat, lng]]
                coordsJsonStr = String.format(Locale.US, "[[%.6f,%.6f]]", lat, lng);
                body.addProperty("coordinates_json", coordsJsonStr);
                body.addProperty("radius", (radiusMeters != null) ? radiusMeters : 50.0);
            } else if ("polygon".equalsIgnoreCase(shape) && points != null && !points.isEmpty()) {
                // 多边形：点数组 [[lat,lng],...]
                StringBuilder sb = new StringBuilder();
                sb.append("[");
                boolean first = true;
                for (double[] p : points) {
                    if (p == null || p.length < 2) continue;
                    if (!first) sb.append(",");
                    first = false;
                    sb.append(String.format(Locale.US, "[%.6f,%.6f]", p[0], p[1]));
                }
                sb.append("]");
                coordsJsonStr = sb.toString();
                body.addProperty("coordinates_json", coordsJsonStr);
            } else {
                body.addProperty("coordinates_json", "[]");
                body.addProperty("radius", (radiusMeters != null) ? radiusMeters : 50.0);
            }

            return body;
        }

        public JsonObject buildFenceCreateBody() {
            // �?toCreateBody() 保持一致，使用后端 POST /fence/ 新格�?
            return toCreateBody();
        }

        private static String buildPolygonCoordinatesJsonLngLat(List<double[]> pts) {
            if (pts == null || pts.size() < 3) return null;

            StringBuilder sb = new StringBuilder();
            sb.append("["); // 一层：[[lat,lng],...]

            boolean first = true;
            for (double[] p : pts) {
                if (p == null || p.length < 2) continue;
                if (!first) sb.append(",");
                first = false;

                // �?输出 [lat,lng]（网页端多数用这个；至少你们现网是这个，否则不会“之前还能看到一条边”）
                sb.append(String.format(Locale.US, "[%.6f,%.6f]", p[0], p[1]));
            }

            sb.append("]");
            return sb.toString();
        }




        private static String buildCircleCoordinatesJsonLngLat(Double lat, Double lng, double radiusMeters, int segments) {
            if (lat == null || lng == null) return null;

            int seg = Math.max(24, segments); // 让圆更平滑一�?
            StringBuilder sb = new StringBuilder();
            sb.append("[[");

            for (int i = 0; i < seg; i++) {
                double theta = (2.0 * Math.PI * i) / seg;

                double dLat = (radiusMeters * Math.sin(theta)) / EARTH_RADIUS;
                double dLng = (radiusMeters * Math.cos(theta)) / (EARTH_RADIUS * Math.cos(Math.toRadians(lat)));

                double pLat = lat + Math.toDegrees(dLat);
                double pLng = lng + Math.toDegrees(dLng);

                if (i > 0) sb.append(",");
                sb.append(String.format(Locale.US, "[%.6f,%.6f]", pLng, pLat)); // 输出 [lng,lat]
            }

            // �?闭合：补第一个点
            double theta0 = 0.0;
            double dLat0 = (radiusMeters * Math.sin(theta0)) / EARTH_RADIUS;
            double dLng0 = (radiusMeters * Math.cos(theta0)) / (EARTH_RADIUS * Math.cos(Math.toRadians(lat)));
            double pLat0 = lat + Math.toDegrees(dLat0);
            double pLng0 = lng + Math.toDegrees(dLng0);
            sb.append(",").append(String.format(Locale.US, "[%.6f,%.6f]", pLng0, pLat0));

            sb.append("]]");
            return sb.toString();
        }

    }

    static class UiRegion {
        String id;  // 后端返回字符串ID，如 "region1"
        String name;
        List<double[]> points = new ArrayList<>();

        static UiRegion fromJson(JsonObject o) {
            UiRegion r = new UiRegion();
            if (o == null) return r;

            r.id = optStr(o, "id", "");  // 使用字符串解析
            r.name = optStr(o, "name", optStr(o, "region_name", "未命名区域"));

            String coords = optStr(o, "coordinates_json", null);
            if (coords != null) {
                r.points = parsePointsLngLatToLatLng(coords);
            }
            return r;
        }
    }

    // -------------------------
    // json helpers (static)
    // -------------------------
    private static String optString(JsonObject o, String key) {
        if (o == null || !o.has(key) || o.get(key).isJsonNull()) return null;
        try { return o.get(key).getAsString(); } catch (Exception e) { return null; }
    }

    private static Integer optIntNullable(JsonObject o, String key) {
        if (o == null || !o.has(key) || o.get(key).isJsonNull()) return null;
        try {
            JsonElement el = o.get(key);
            if (el.isJsonPrimitive()) {
                JsonPrimitive prim = el.getAsJsonPrimitive();
                if (prim.isNumber()) {
                    return prim.getAsInt();
                } else if (prim.isString()) {
                    try {
                        return Integer.parseInt(prim.getAsString());
                    } catch (NumberFormatException e) {
                        return null;
                    }
                }
            }
            return null;
        } catch (Exception e) { return null; }
    }

    private static Double optDoubleNullable(JsonObject o, String key) {
        if (o == null || !o.has(key) || o.get(key).isJsonNull()) return null;
        try { return o.get(key).getAsDouble(); } catch (Exception e) { return null; }
    }

    private static Boolean optBoolNullable(JsonObject o, String key) {
        if (o == null || !o.has(key) || o.get(key).isJsonNull()) return null;
        try {
            JsonElement el = o.get(key);
            if (el.isJsonPrimitive()) {
                try { return el.getAsInt() != 0; } catch (Exception ignore) {}
                try { return el.getAsBoolean(); } catch (Exception ignore) {}
            }
        } catch (Exception ignore) {}
        return null;
    }

    private static String optStr(JsonObject o, String k, String def) {
        return (o != null && o.has(k) && !o.get(k).isJsonNull()) ? o.get(k).getAsString() : def;
    }

    private static int optInt(JsonObject o, String k, int def) {
        if (o == null || !o.has(k) || o.get(k).isJsonNull()) return def;
        try {
            JsonElement el = o.get(k);
            if (el.isJsonPrimitive()) {
                JsonPrimitive prim = el.getAsJsonPrimitive();
                if (prim.isNumber()) {
                    return prim.getAsInt();
                } else if (prim.isString()) {
                    try {
                        return Integer.parseInt(prim.getAsString());
                    } catch (NumberFormatException e) {
                        return def;
                    }
                }
            }
            return def;
        } catch (Exception e) { return def; }
    }

    private static JsonArray optJsonArray(JsonObject o, String k) {
        if (o == null || !o.has(k) || o.get(k).isJsonNull()) return null;
        try {
            JsonElement el = o.get(k);
            if (el.isJsonArray()) return el.getAsJsonArray();
        } catch (Exception ignored) {}
        return null;
    }

    private static JsonObject optJsonObject(JsonObject o, String k) {
        if (o == null || !o.has(k) || o.get(k).isJsonNull()) return null;
        try {
            JsonElement el = o.get(k);
            if (el.isJsonObject()) return el.getAsJsonObject();
        } catch (Exception ignored) {}
        return null;
    }

    private static List<double[]> parsePointsLngLatToLatLng(String coordinatesJson) {
        List<double[]> out = new ArrayList<>();
        if (coordinatesJson == null || coordinatesJson.trim().isEmpty()) return out;

        try {
            JSONArray arr = new JSONArray(coordinatesJson);

            // 兼容 A: [[[lng,lat],...]] 这种 ring 结构
            // 如果第一层里面还�?JSONArray，并且它的第 0 项也�?JSONArray，则�?arr[0] 当作点集
            if (arr.length() > 0 && arr.optJSONArray(0) != null) {
                JSONArray first = arr.optJSONArray(0);
                if (first != null && first.length() > 0 && first.optJSONArray(0) != null) {
                    arr = first; // 现在 arr 就是 [[x,y],[x,y],...]
                }
            }

            for (int i = 0; i < arr.length(); i++) {
                JSONArray p = arr.optJSONArray(i);
                if (p == null || p.length() < 2) continue;

                double a = p.optDouble(0); // x
                double b = p.optDouble(1); // y

                // 默认�?[lng,lat]
                double lng = a;
                double lat = b;

                // 自动纠正：如�?lat 超出 [-90,90]，尝试交�?
                if (Math.abs(lat) > 90 && Math.abs(a) <= 90 && Math.abs(b) <= 180) {
                    lat = a;
                    lng = b;
                }

                // 过滤非法范围
                if (Math.abs(lat) > 90 || Math.abs(lng) > 180) continue;

                out.add(new double[]{lat, lng}); // 内部统一�?[lat,lng]
            }
        } catch (Exception ignore) {}

        // 如果最后一个点等于第一个点（闭合），Web 端画 polygon 可能不需要重复，
        // 但我们内部也可保留。这里不强制删除。
        return out;
    }

}
