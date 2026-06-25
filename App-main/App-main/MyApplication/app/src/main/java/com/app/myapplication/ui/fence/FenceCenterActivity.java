package com.app.myapplication.ui.fence;

import android.Manifest;
import android.app.TimePickerDialog;
import android.content.pm.PackageManager;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.location.Location;
import android.os.Bundle;
import android.text.Editable;
import android.text.TextUtils;
import android.text.TextWatcher;
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
import com.amap.api.services.core.AMapException;
import com.amap.api.services.core.PoiItem;
import com.amap.api.services.poisearch.PoiResult;
import com.amap.api.services.poisearch.PoiSearch;

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
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

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

        @GET("api/responsibility-units/tree")
        Call<JsonArray> getResponsibilityTree();
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

    private Button btnNew, btnList;
    private ImageButton btnBackHome;
    private View btnLocate;
    private EditText etUnitFenceSearch;
    private ListPopupWindow searchSuggestionsPopup;
    private ArrayAdapter<String> searchSuggestionAdapter;
    private View panelAdd, panelList;

    private EditText etName, etRadius;
    private SeekBar sbRadius;
    private RadioGroup rgShape;
    private RadioButton rbCircle, rbPolygon;
    private View groupCircle, groupPolygon;
    private Button btnUndo, btnClear, btnCancel, btnSave;
    private Button btnSelectUnit;

    private Spinner spTriggerType;
    private Switch swEnable;
    private Button btnEffectiveStart, btnEffectiveEnd;

    private RecyclerView rvFence;
    private RecyclerView rvDevice;
    private Button btnCloseList;
    private Button btnTabFence;
    private Button btnTabDevice;
    private TextView tvListTitle;

    private FenceTreeAdapter fenceAdapter;
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
    private final List<OrgOption> orgOptions = new ArrayList<>();
    private final List<SearchTarget> organizationTargets = new ArrayList<>();
    private final Map<String, String> organizationNameById = new HashMap<>();
    private final List<SearchTarget> searchSuggestions = new ArrayList<>();
    private boolean selectingSearchSuggestion = false;

    private boolean addMode = false;
    private OrgOption selectedOrg = null;

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

    private static class SearchTarget {
        final String type;
        final String label;
        final String name;
        final String searchText;
        final LatLng position;
        final float zoom;
        final DeviceItem device;

        SearchTarget(String type, String name, LatLng position, float zoom) {
            this(type, name, position, zoom, null, "");
        }

        SearchTarget(
                String type,
                String name,
                LatLng position,
                float zoom,
                @Nullable DeviceItem device,
                String extraSearchText
        ) {
            this.type = type;
            this.name = name;
            String deviceId = device == null || TextUtils.isEmpty(device.deviceId)
                    ? "" : " (" + device.deviceId + ")";
            this.label = type + " · " + name + deviceId;
            this.searchText = (this.label + " " + extraSearchText).toLowerCase(Locale.ROOT);
            this.position = position;
            this.zoom = zoom;
            this.device = device;
        }
    }

    private static class OrgOption {
        String type;
        String label;
        String company;
        String project;
        String grid;
        String team;
        String branchId;
        String projectId;
        String gridId;
        String teamId;

        String displayLabel() {
            return label == null || label.trim().isEmpty() ? "未选择所属单位" : label;
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
        btnBackHome = findViewById(R.id.btn_back_home);
        btnLocate = findViewById(R.id.btn_locate);
        etUnitFenceSearch = findViewById(R.id.et_unit_fence_search);

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
        btnEffectiveStart = findViewById(R.id.btn_effective_start);
        btnEffectiveEnd = findViewById(R.id.btn_effective_end);

        btnCancel = findViewById(R.id.btn_cancel);
        btnSave = findViewById(R.id.btn_save);
        btnSelectUnit = findViewById(R.id.btn_select_unit);

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
        fenceAdapter = new FenceTreeAdapter(
                fences,
                organizationNameById,
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
        btnBackHome.setOnClickListener(v -> finish());
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

        searchSuggestionAdapter = new ArrayAdapter<>(
                this,
                R.layout.item_search_suggestion,
                new ArrayList<>()
        );
        searchSuggestionsPopup = new ListPopupWindow(this);
        searchSuggestionsPopup.setAnchorView(etUnitFenceSearch);
        searchSuggestionsPopup.setAdapter(searchSuggestionAdapter);
        searchSuggestionsPopup.setModal(false);
        searchSuggestionsPopup.setOnItemClickListener((parent, view, position, id) -> {
            if (position >= 0 && position < searchSuggestions.size()) {
                selectSearchTarget(searchSuggestions.get(position));
            }
        });
        etUnitFenceSearch.addTextChangedListener(new TextWatcher() {
            @Override public void beforeTextChanged(CharSequence s, int start, int count, int after) {}
            @Override public void onTextChanged(CharSequence s, int start, int before, int count) {}

            @Override
            public void afterTextChanged(Editable s) {
                if (!selectingSearchSuggestion) {
                    searchUnitsAndFences(s == null ? "" : s.toString());
                }
            }
        });
        etUnitFenceSearch.setOnFocusChangeListener((v, hasFocus) -> {
            if (hasFocus) {
                searchUnitsAndFences(etUnitFenceSearch.getText() == null
                        ? "" : etUnitFenceSearch.getText().toString());
            } else if (searchSuggestionsPopup != null) {
                v.postDelayed(() -> searchSuggestionsPopup.dismiss(), 150);
            }
        });
        etUnitFenceSearch.setOnEditorActionListener((v, actionId, event) -> {
            if (!searchSuggestions.isEmpty()) {
                selectSearchTarget(searchSuggestions.get(0));
            }
            return true;
        });

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

        btnEffectiveStart.setOnClickListener(v -> showEffectiveTimePicker(btnEffectiveStart));
        btnEffectiveEnd.setOnClickListener(v -> showEffectiveTimePicker(btnEffectiveEnd));
        btnSelectUnit.setOnClickListener(v -> showOrgSelectDialog());

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
                    refreshActiveSearch();
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
        selectedOrg = null;
        updateSelectedOrgText();
        rbCircle.setChecked(true);

        circleRadius = 50;
        suppressUiSync = true;
        etRadius.setText(String.valueOf((int) circleRadius));
        sbRadius.setProgress((int) circleRadius);
        suppressUiSync = false;

        spTriggerType.setSelection(0);
        swEnable.setChecked(true);
        setEffectiveTimeUi("00:00-23:59");

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
        selectedOrg = findOrgOptionForFence(f);
        updateSelectedOrgText();

        String beh = (f.ruleType == null) ? BEHAVIOR_NO_ENTRY : f.ruleType;
        if (BEHAVIOR_NO_EXIT.equalsIgnoreCase(beh)) spTriggerType.setSelection(1);
        else spTriggerType.setSelection(0);
        swEnable.setChecked(f.enabled == null || f.enabled);
        setEffectiveTimeUi(f.effectiveTime);

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

    private void showEffectiveTimePicker(@NonNull Button target) {
        int[] current = parseTimePart(target.getText() == null ? null : target.getText().toString());
        int hour = current == null ? 0 : current[0];
        int minute = current == null ? 0 : current[1];
        new TimePickerDialog(
                this,
                (view, selectedHour, selectedMinute) ->
                        target.setText(String.format(Locale.CHINA, "%02d:%02d", selectedHour, selectedMinute)),
                hour,
                minute,
                true
        ).show();
    }

    private void setEffectiveTimeUi(String effectiveTime) {
        String normalized = normalizeEffectiveTime(effectiveTime);
        if (normalized == null) normalized = "00:00-23:59";
        String[] parts = normalized.split("-", 2);
        btnEffectiveStart.setText(parts[0]);
        btnEffectiveEnd.setText(parts[1]);
    }

    private String getEffectiveTimeFromUi() {
        String start = btnEffectiveStart.getText() == null ? "" : btnEffectiveStart.getText().toString();
        String end = btnEffectiveEnd.getText() == null ? "" : btnEffectiveEnd.getText().toString();
        return normalizeEffectiveTime(start + "-" + end);
    }

    private void showOrgSelectDialog() {
        if (orgOptions.isEmpty()) {
            toast("?????????????");
            return;
        }

        int padding = dp(16);
        LinearLayout container = new LinearLayout(this);
        container.setOrientation(LinearLayout.VERTICAL);
        container.setPadding(padding, 0, padding, 0);

        EditText searchInput = new EditText(this);
        searchInput.setSingleLine(true);
        searchInput.setHint("?????????????");
        searchInput.setInputType(android.text.InputType.TYPE_CLASS_TEXT);
        container.addView(searchInput, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                dp(44)
        ));

        ListView listView = new ListView(this);
        listView.setChoiceMode(ListView.CHOICE_MODE_SINGLE);
        listView.setDividerHeight(0);
        container.addView(listView, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                dp(420)
        ));

        List<OrgOption> filteredOptions = new ArrayList<>();
        ArrayAdapter<String> adapter = new ArrayAdapter<>(
                this,
                android.R.layout.simple_list_item_single_choice,
                new ArrayList<>()
        );
        listView.setAdapter(adapter);
        refreshOrgDialogOptions("", filteredOptions, adapter, listView);

        AlertDialog dialog = new AlertDialog.Builder(this)
                .setTitle("??????")
                .setView(container)
                .setNegativeButton("??", null)
                .create();

        listView.setOnItemClickListener((parent, view, position, id) -> {
            if (position >= 0 && position < filteredOptions.size()) {
                selectedOrg = filteredOptions.get(position);
                updateSelectedOrgText();
                dialog.dismiss();
            }
        });

        searchInput.addTextChangedListener(new TextWatcher() {
            @Override
            public void beforeTextChanged(CharSequence s, int start, int count, int after) {}

            @Override
            public void onTextChanged(CharSequence s, int start, int before, int count) {
                refreshOrgDialogOptions(s == null ? "" : s.toString(), filteredOptions, adapter, listView);
            }

            @Override
            public void afterTextChanged(Editable s) {}
        });

        dialog.setOnShowListener(d -> searchInput.requestFocus());
        dialog.show();
    }

    private void refreshOrgDialogOptions(String query,
                                         List<OrgOption> filteredOptions,
                                         ArrayAdapter<String> adapter,
                                         ListView listView) {
        filteredOptions.clear();
        List<String> labels = new ArrayList<>();
        for (OrgOption option : orgOptions) {
            if (matchesOrgQuery(option, query)) {
                filteredOptions.add(option);
                labels.add(option.displayLabel());
            }
        }

        adapter.clear();
        adapter.addAll(labels);
        adapter.notifyDataSetChanged();

        listView.clearChoices();
        int checked = -1;
        for (int i = 0; i < filteredOptions.size(); i++) {
            if (sameOrgOption(selectedOrg, filteredOptions.get(i))) {
                checked = i;
                break;
            }
        }
        if (checked >= 0) {
            listView.setItemChecked(checked, true);
        }
    }

    private boolean matchesOrgQuery(OrgOption option, String query) {
        if (option == null) return false;
        String keyword = query == null ? "" : query.trim().toLowerCase(Locale.ROOT);
        if (TextUtils.isEmpty(keyword)) return true;
        String haystack = TextUtils.join(" ", new String[]{
                option.displayLabel(),
                option.company == null ? "" : option.company,
                option.project == null ? "" : option.project,
                option.grid == null ? "" : option.grid,
                option.team == null ? "" : option.team
        }).toLowerCase(Locale.ROOT);
        return haystack.contains(keyword);
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }

    private void updateSelectedOrgText() {
        if (btnSelectUnit == null) return;
        if (selectedOrg == null) {
            btnSelectUnit.setText("?????????/??/??/???");
        } else {
            btnSelectUnit.setText("?????" + selectedOrg.displayLabel());
        }
    }

    private boolean sameOrgOption(OrgOption a, OrgOption b) {
        if (a == null || b == null) return false;
        return safeEquals(a.type, b.type)
                && safeEquals(a.branchId, b.branchId)
                && safeEquals(a.projectId, b.projectId)
                && safeEquals(a.gridId, b.gridId)
                && safeEquals(a.teamId, b.teamId)
                && safeEquals(a.label, b.label);
    }

    private boolean safeEquals(String a, String b) {
        return TextUtils.equals(a == null ? "" : a.trim(), b == null ? "" : b.trim());
    }

    private OrgOption findOrgOptionForFence(UiFence fence) {
        if (fence == null || orgOptions.isEmpty()) return null;
        OrgOption best = null;
        int bestScore = -1;
        for (OrgOption option : orgOptions) {
            int score = 0;
            if (!TextUtils.isEmpty(fence.teamId) && safeEquals(fence.teamId, option.teamId)) score += 100;
            if (!TextUtils.isEmpty(fence.gridId) && safeEquals(fence.gridId, option.gridId)) score += 40;
            if (!TextUtils.isEmpty(fence.projectId) && safeEquals(fence.projectId, option.projectId)) score += 20;
            if (!TextUtils.isEmpty(fence.branchId) && safeEquals(fence.branchId, option.branchId)) score += 10;
            if (!TextUtils.isEmpty(fence.team) && safeEquals(fence.team, option.team)) score += 50;
            if (!TextUtils.isEmpty(fence.grid) && safeEquals(fence.grid, option.grid)) score += 25;
            if (!TextUtils.isEmpty(fence.project) && safeEquals(fence.project, option.project)) score += 12;
            if (!TextUtils.isEmpty(fence.company) && safeEquals(fence.company, option.company)) score += 6;
            if (score > bestScore) {
                bestScore = score;
                best = option;
            }
        }
        return bestScore > 0 ? best : null;
    }

    private OrgOption findMatchingOrgOption(OrgOption source) {
        if (source == null) return null;
        for (OrgOption option : orgOptions) {
            if (sameOrgOption(source, option)) return option;
        }
        return source;
    }

    private void applyOrgToFence(UiFence fence, OrgOption option) {
        if (fence == null || option == null) return;
        fence.company = option.company;
        fence.project = option.project;
        fence.grid = option.grid;
        fence.team = option.team;
        fence.branchId = option.branchId;
        fence.projectId = option.projectId;
        fence.gridId = option.gridId;
        fence.teamId = option.teamId;
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

    private void searchPlaces(String rawKeyword) {
        String keyword = rawKeyword == null ? "" : rawKeyword.trim();
        if (keyword.isEmpty()) {
            toast("请输入地点名称");
            return;
        }

        try {
            PoiSearch.Query query = new PoiSearch.Query(keyword, "", "");
            query.setPageSize(20);
            query.setPageNum(1);
            PoiSearch poiSearch = new PoiSearch(this, query);
            poiSearch.setOnPoiSearchListener(new PoiSearch.OnPoiSearchListener() {
                @Override
                public void onPoiSearched(PoiResult result, int errorCode) {
                    List<PoiItem> items = result == null ? null : result.getPois();
                    if (errorCode != 1000 || items == null || items.isEmpty()) {
                        toast("未找到相关地点");
                        return;
                    }

                    String[] labels = new String[items.size()];
                    for (int i = 0; i < items.size(); i++) {
                        PoiItem item = items.get(i);
                        String address = item.getSnippet();
                        labels[i] = item.getTitle() + (TextUtils.isEmpty(address) ? "" : "\n" + address);
                    }
                    new AlertDialog.Builder(FenceCenterActivity.this)
                            .setTitle("选择地点")
                            .setItems(labels, (dialog, which) -> selectPlaceForFence(items.get(which)))
                            .setNegativeButton("取消", null)
                            .show();
                }

                @Override
                public void onPoiItemSearched(PoiItem item, int errorCode) {
                    // Keyword search uses the list callback above.
                }
            });
            poiSearch.searchPOIAsyn();
        } catch (AMapException e) {
            android.util.Log.e("FenceCenter", "POI search failed", e);
            toast("地点搜索服务不可用");
        }
    }

    private void selectPlaceForFence(PoiItem item) {
        if (item == null || item.getLatLonPoint() == null) return;
        LatLng point = new LatLng(
                item.getLatLonPoint().getLatitude(),
                item.getLatLonPoint().getLongitude()
        );
        enterAddMode();
        rbCircle.setChecked(true);
        setCircleCenter(point);
        aMap.animateCamera(CameraUpdateFactory.newLatLngZoom(point, 17f));
    }

    private void searchUnitsAndFences(String rawKeyword) {
        String keyword = rawKeyword == null ? "" : rawKeyword.trim().toLowerCase(Locale.ROOT);
        if (keyword.isEmpty()) {
            searchSuggestions.clear();
            if (searchSuggestionAdapter != null) {
                searchSuggestionAdapter.clear();
                searchSuggestionAdapter.notifyDataSetChanged();
            }
            if (searchSuggestionsPopup != null) searchSuggestionsPopup.dismiss();
            return;
        }

        List<SearchTarget> results = new ArrayList<>();
        for (SearchTarget target : organizationTargets) {
            if (target.searchText.contains(keyword) && target.position != null) {
                results.add(target);
            }
        }
        for (UiFence fence : fences) {
            String fenceName = fence == null || fence.name == null ? "" : fence.name.trim();
            if (!fenceName.toLowerCase(Locale.ROOT).contains(keyword)) continue;
            LatLng center = fence.getBestCenterLatLng();
            if (center != null) {
                results.add(new SearchTarget("围栏", fenceName, center, 17f));
            }
        }
        for (DeviceItem device : devices) {
            if (device == null || !device.hasLocation()) continue;
            String deviceName = TextUtils.isEmpty(device.name) ? "" : device.name.trim();
            String deviceId = TextUtils.isEmpty(device.deviceId) ? "" : device.deviceId.trim();
            String deviceSearchText = String.join(" ",
                    deviceName,
                    deviceId,
                    TextUtils.isEmpty(device.company) ? "" : device.company,
                    TextUtils.isEmpty(device.project) ? "" : device.project,
                    TextUtils.isEmpty(device.team) ? "" : device.team
            ).toLowerCase(Locale.ROOT);
            if (!deviceSearchText.contains(keyword)) continue;
            String displayName = TextUtils.isEmpty(deviceName) ? deviceId : deviceName;
            if (TextUtils.isEmpty(displayName)) continue;
            results.add(new SearchTarget(
                    "设备",
                    displayName,
                    new LatLng(device.lat, device.lng),
                    18f,
                    device,
                    deviceSearchText
            ));
        }

        results.sort((a, b) -> {
            int priorityCompare = Integer.compare(searchTargetPriority(a), searchTargetPriority(b));
            if (priorityCompare != 0) return priorityCompare;
            boolean aNameMatched = a.name.toLowerCase(Locale.ROOT).contains(keyword);
            boolean bNameMatched = b.name.toLowerCase(Locale.ROOT).contains(keyword);
            if (aNameMatched != bNameMatched) return aNameMatched ? -1 : 1;
            return a.label.compareTo(b.label);
        });

        if (results.isEmpty()) {
            searchSuggestions.clear();
            searchSuggestionAdapter.clear();
            searchSuggestionAdapter.notifyDataSetChanged();
            searchSuggestionsPopup.dismiss();
            return;
        }
        if (results.size() > 12) {
            results = new ArrayList<>(results.subList(0, 12));
        }

        searchSuggestions.clear();
        searchSuggestions.addAll(results);
        searchSuggestionAdapter.clear();
        for (SearchTarget result : results) {
            searchSuggestionAdapter.add(result.label);
        }
        searchSuggestionAdapter.notifyDataSetChanged();
        if (etUnitFenceSearch.hasFocus()) searchSuggestionsPopup.show();
    }

    private void selectSearchTarget(@NonNull SearchTarget target) {
        selectingSearchSuggestion = true;
        etUnitFenceSearch.setText(target.name);
        etUnitFenceSearch.setSelection(etUnitFenceSearch.length());
        selectingSearchSuggestion = false;
        searchSuggestionsPopup.dismiss();
        panelList.setVisibility(View.GONE);
        if (target.device != null) {
            focusOnDevice(target.device);
        } else {
            aMap.animateCamera(CameraUpdateFactory.newLatLngZoom(target.position, target.zoom));
        }
    }

    private void refreshActiveSearch() {
        if (etUnitFenceSearch == null || !etUnitFenceSearch.hasFocus()) return;
        searchUnitsAndFences(etUnitFenceSearch.getText() == null
                ? "" : etUnitFenceSearch.getText().toString());
    }

    private int searchTargetPriority(SearchTarget target) {
        if (target == null) return 99;
        String type = target.type == null ? "" : target.type.toLowerCase(Locale.ROOT);
        if (type.contains("项目") || type.contains("project")) return 10;
        if (type.contains("网格") || type.contains("grid")) return 20;
        if (type.contains("工队") || type.contains("作业队") || type.contains("team")) return 25;
        if (type.contains("公司") || type.contains("单位") || type.contains("branch")) return 30;
        if (type.contains("设备") || type.contains("device")) return 35;
        if (type.contains("围栏") || type.contains("fence")) return 40;
        return 50;
    }

    private LatLng collectOrganizationTargets(JsonObject node, String parentPath) {
        String name = jsonString(node, "name");
        String type = jsonString(node, "type");
        rememberOrganizationName(node, name);
        String path = TextUtils.isEmpty(parentPath) ? name : parentPath + " / " + name;
        // Project records may contain stale latitude/longitude values while center
        // is synchronized with the project's area boundary. Prefer that center for
        // project searches; retain the existing coordinate priority for other units.
        LatLng position = "project".equalsIgnoreCase(type) ? parseNodeCenter(node) : null;
        if (position == null) position = parseNodePosition(node);

        List<LatLng> childPositions = new ArrayList<>();
        JsonArray children = node.has("children") && node.get("children").isJsonArray()
                ? node.getAsJsonArray("children")
                : null;
        if (children != null) {
            for (JsonElement child : children) {
                if (child != null && child.isJsonObject()) {
                    LatLng childPosition = collectOrganizationTargets(child.getAsJsonObject(), path);
                    if (childPosition != null) childPositions.add(childPosition);
                }
            }
        }

        if (position == null && !childPositions.isEmpty()) {
            double lat = 0;
            double lng = 0;
            for (LatLng child : childPositions) {
                lat += child.latitude;
                lng += child.longitude;
            }
            position = new LatLng(lat / childPositions.size(), lng / childPositions.size());
        }

        if (!TextUtils.isEmpty(name) && position != null) {
            String typeName = organizationTypeName(type);
            float zoom = "team".equalsIgnoreCase(type) ? 19f
                    : "grid".equalsIgnoreCase(type) ? 17f
                    : "project".equalsIgnoreCase(type) ? 15f : 13f;
            organizationTargets.add(new SearchTarget(typeName, path, position, zoom));
        }
        return position;
    }

    private void collectOrganizationOptions(JsonObject node, @Nullable OrgOption parent) {
        if (node == null) return;
        String name = jsonString(node, "name");
        String type = jsonString(node, "type").toLowerCase(Locale.ROOT);
        if (TextUtils.isEmpty(name)) return;

        OrgOption option = new OrgOption();
        if (parent != null) {
            option.company = parent.company;
            option.project = parent.project;
            option.grid = parent.grid;
            option.team = parent.team;
            option.branchId = parent.branchId;
            option.projectId = parent.projectId;
            option.gridId = parent.gridId;
            option.teamId = parent.teamId;
        }
        option.type = type;

        String id = firstNonEmpty(
                jsonString(node, "id"),
                jsonString(node, "unit_id"),
                jsonString(node, type + "_id")
        );
        if ("branch".equals(type) || "company".equals(type)) {
            option.company = name;
            option.branchId = id;
        } else if ("project".equals(type)) {
            option.project = name;
            option.projectId = firstNonEmpty(jsonString(node, "project_id"), id);
            option.branchId = firstNonEmpty(option.branchId, jsonString(node, "branch_id"));
        } else if ("grid".equals(type)) {
            option.grid = name;
            option.gridId = firstNonEmpty(jsonString(node, "grid_id"), id);
            option.projectId = firstNonEmpty(option.projectId, jsonString(node, "project_id"));
        } else if ("team".equals(type)) {
            option.team = name;
            option.teamId = firstNonEmpty(jsonString(node, "team_id"), id);
            option.gridId = firstNonEmpty(option.gridId, jsonString(node, "grid_id"));
            option.projectId = firstNonEmpty(option.projectId, jsonString(node, "project_id"));
        }

        if (isSelectableOrgType(type)) {
            option.label = buildOrgLabel(option);
            orgOptions.add(option);
        }

        JsonArray children = node.has("children") && node.get("children").isJsonArray()
                ? node.getAsJsonArray("children")
                : null;
        if (children != null) {
            for (JsonElement child : children) {
                if (child != null && child.isJsonObject()) {
                    collectOrganizationOptions(child.getAsJsonObject(), option);
                }
            }
        }
    }

    private boolean isSelectableOrgType(String type) {
        return "branch".equalsIgnoreCase(type)
                || "company".equalsIgnoreCase(type)
                || "project".equalsIgnoreCase(type)
                || "grid".equalsIgnoreCase(type)
                || "team".equalsIgnoreCase(type);
    }

    private String buildOrgLabel(OrgOption option) {
        List<String> parts = new ArrayList<>();
        addPart(parts, option.company);
        addPart(parts, option.project);
        addPart(parts, option.grid);
        addPart(parts, option.team);
        return TextUtils.join(" / ", parts);
    }

    private void addPart(List<String> parts, String value) {
        if (!TextUtils.isEmpty(value) && !parts.contains(value.trim())) parts.add(value.trim());
    }

    private void rememberOrganizationName(JsonObject node, String name) {
        if (TextUtils.isEmpty(name)) return;
        String type = jsonString(node, "type").toLowerCase(Locale.ROOT);
        List<String> keys = new ArrayList<>();
        keys.add(jsonString(node, "id"));
        keys.add(jsonString(node, "unit_id"));
        if ("project".equals(type)) keys.add(jsonString(node, "project_id"));
        if ("grid".equals(type)) keys.add(jsonString(node, "grid_id"));
        if ("team".equals(type)) keys.add(jsonString(node, "team_id"));
        for (String key : keys) {
            if (TextUtils.isEmpty(key)) continue;
            organizationNameById.put(key, name);
            if (key.startsWith("synthetic-")) {
                organizationNameById.put(key.substring("synthetic-".length()), name);
            }
        }
    }

    private LatLng parseNodePosition(JsonObject node) {
        Double lat = jsonDouble(node, "latitude", "lat");
        Double lng = jsonDouble(node, "longitude", "lng");
        if (validCoordinate(lat, lng)) return new LatLng(lat, lng);

        return parseNodeCenter(node);
    }

    private LatLng parseNodeCenter(JsonObject node) {
        if (!node.has("center")) return null;
        JsonElement centerElement = node.get("center");
        try {
            JsonArray center;
            if (centerElement.isJsonArray()) {
                center = centerElement.getAsJsonArray();
            } else if (centerElement.isJsonPrimitive()) {
                center = JsonParser.parseString(centerElement.getAsString()).getAsJsonArray();
            } else {
                return null;
            }
            if (center.size() < 2) return null;
            double first = center.get(0).getAsDouble();
            double second = center.get(1).getAsDouble();
            if (validCoordinate(first, second)) return new LatLng(first, second);
            if (validCoordinate(second, first)) return new LatLng(second, first);
        } catch (Exception ignored) {
        }
        return null;
    }

    private static boolean validCoordinate(Double lat, Double lng) {
        return lat != null && lng != null
                && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180
                && !(lat == 0 && lng == 0);
    }

    private static Double jsonDouble(JsonObject object, String... keys) {
        for (String key : keys) {
            try {
                if (object.has(key) && !object.get(key).isJsonNull()) {
                    return object.get(key).getAsDouble();
                }
            } catch (Exception ignored) {
            }
        }
        return null;
    }

    private static String jsonString(JsonObject object, String key) {
        try {
            return object.has(key) && !object.get(key).isJsonNull()
                    ? object.get(key).getAsString().trim() : "";
        } catch (Exception ignored) {
            return "";
        }
    }

    private static String organizationTypeName(String type) {
        if ("branch".equalsIgnoreCase(type)) return "公司";
        if ("project".equalsIgnoreCase(type)) return "项目";
        if ("grid".equalsIgnoreCase(type)) return "网格";
        if ("team".equalsIgnoreCase(type)) return "作业队";
        return "单位";
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
                fenceAdapter.rebuild();
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

        api.getResponsibilityTree().enqueue(new Callback<JsonArray>() {
            @Override
            public void onResponse(@NonNull Call<JsonArray> call, @NonNull Response<JsonArray> resp) {
                        if (!resp.isSuccessful() || resp.body() == null) return;
                        OrgOption previousSelection = selectedOrg;
                        organizationTargets.clear();
                        organizationNameById.clear();
                        orgOptions.clear();
                        for (JsonElement element : resp.body()) {
                            if (element != null && element.isJsonObject()) {
                                JsonObject node = element.getAsJsonObject();
                                collectOrganizationTargets(node, "");
                                collectOrganizationOptions(node, null);
                            }
                        }
                        selectedOrg = findMatchingOrgOption(previousSelection);
                        updateSelectedOrgText();
                        fenceAdapter.rebuild();
                    }

            @Override
            public void onFailure(@NonNull Call<JsonArray> call, @NonNull Throwable t) {
                android.util.Log.w("FenceCenter", "Failed to load organization search data", t);
            }
        });

        // 加载设备数据
        deviceRepo.loadDevices(new DeviceRepository.DataCallback<List<DeviceItem>>() {
            @Override
            public void onSuccess(List<DeviceItem> data) {
                devices.clear();
                devices.addAll(data);
                redrawAll();
                refreshActiveSearch();
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
        if (selectedOrg == null && editMode && editingOrigin != null) {
            selectedOrg = findOrgOptionForFence(editingOrigin);
            updateSelectedOrgText();
        }
        if (selectedOrg == null) {
            toast("请选择所属单位");
            return;
        }
        applyOrgToFence(draft, selectedOrg);
        draft.effectiveTime = getEffectiveTimeFromUi();
        if (draft.effectiveTime == null) {
            toast("生效时间格式不正确");
            return;
        }

        if (editMode && editingOrigin != null) {
            draft.level = editingOrigin.level;
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
        fenceAdapter.rebuild();
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
                    fenceAdapter.rebuild();
                    redrawAll();
                    toast("启用状态更新失败 HTTP " + resp.code());
                    return;
                }
                toast(newEnabled ? "已启用" : "已停用");
            }

            @Override
            public void onFailure(@NonNull Call<JsonObject> call, @NonNull Throwable t) {
                fence.enabled = old; // 回滚
                fenceAdapter.rebuild();
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
        String[] items = new String[]{"查看详情", "定位到地图", "编辑", "删除"};
        new AlertDialog.Builder(this)
                .setTitle(f.name == null ? "围栏" : f.name)
                .setItems(items, (d, which) -> {
                    if (which == 0) showFenceDetail(f);
                    else if (which == 1) focusFenceOnMap(f);
                    else if (which == 2) enterEditMode(f);
                    else if (which == 3) confirmDeleteFence(f);
                })
                .show();
    }

    private void showFenceDetail(@NonNull UiFence f) {
        String shapeText = "POLYGON".equalsIgnoreCase(f.shapeType) ? "多边形" : "圆形";
        String behaviorText = BEHAVIOR_NO_EXIT.equalsIgnoreCase(f.ruleType)
                ? "禁出 (No Exit)"
                : "禁入 (No Entry)";
        String effectiveTime = normalizeEffectiveTime(f.effectiveTime);
        if (effectiveTime == null) effectiveTime = "00:00-23:59";
        String validityStart = formatValidityDateTime(f.scheduleStart);
        String validityEnd = formatValidityDateTime(f.scheduleEnd);

        StringBuilder detail = new StringBuilder()
                .append("形状：").append(shapeText).append('\n')
                .append("触发行为：").append(behaviorText).append('\n')
                .append("有效期开始：").append(validityStart).append('\n')
                .append("有效期结束：").append(validityEnd).append('\n')
                .append("每日生效时段：").append(effectiveTime).append('\n')
                .append("状态：").append(f.enabled == null || f.enabled ? "启用" : "停用");
        if (!TextUtils.isEmpty(f.remark)) {
            detail.append('\n').append("备注：").append(f.remark);
        }

        new AlertDialog.Builder(this)
                .setTitle(TextUtils.isEmpty(f.name) ? "围栏详情" : f.name)
                .setMessage(detail.toString())
                .setPositiveButton("确定", null)
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
        fenceAdapter.rebuild();
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
    static class FenceTreeAdapter extends RecyclerView.Adapter<RecyclerView.ViewHolder> {
        private static final int TYPE_GROUP = 1;
        private static final int TYPE_FENCE = 2;

        interface OnClick { void onClick(UiFence f); }
        interface OnToggle { void onToggle(UiFence f, boolean newEnabled); }
        interface OnLong { void onLong(UiFence f); }

        private final List<UiFence> source;
        private final Map<String, String> organizationNameById;
        private final OnClick onClick;
        private final OnToggle onToggle;
        private final OnLong onLong;
        private final List<TreeRow> rows = new ArrayList<>();
        private final Set<String> collapsedGroups = new LinkedHashSet<>();

        FenceTreeAdapter(
                List<UiFence> source,
                Map<String, String> organizationNameById,
                OnClick onClick,
                OnToggle onToggle,
                OnLong onLong
        ) {
            this.source = source;
            this.organizationNameById = organizationNameById;
            this.onClick = onClick;
            this.onToggle = onToggle;
            this.onLong = onLong;
            rebuild();
        }

        void rebuild() {
            GroupNode root = new GroupNode("", "", -1);
            if (source != null) {
                for (UiFence fence : source) {
                    if (fence == null) continue;
                    GroupNode parent = child(root, safeName(fence.company, "未分配公司"), "company", 0);
                    if (!TextUtils.isEmpty(fence.project) || !TextUtils.isEmpty(fence.projectId)) {
                        parent = child(parent, organizationName(fence.project, fence.projectId, "未分配项目"), "project", 1);
                    }
                    if (!TextUtils.isEmpty(fence.grid) || !TextUtils.isEmpty(fence.gridId)) {
                        parent = child(parent, organizationName(fence.grid, fence.gridId, "未分配网格"), "grid", 2);
                    }
                    if (!TextUtils.isEmpty(fence.team) || !TextUtils.isEmpty(fence.teamId)) {
                        parent = child(parent, organizationName(fence.team, fence.teamId, "未分配工队"), "team", 3);
                    }
                    parent.fences.add(fence);
                }
            }

            rows.clear();
            for (GroupNode company : root.children.values()) appendNode(company);
            notifyDataSetChanged();
        }

        private GroupNode child(GroupNode parent, String name, String type, int depth) {
            String key = parent.key + "/" + type + ":" + name;
            GroupNode existing = parent.children.get(key);
            if (existing != null) return existing;
            GroupNode created = new GroupNode(key, name, depth);
            created.type = type;
            parent.children.put(key, created);
            return created;
        }

        private void appendNode(GroupNode node) {
            rows.add(TreeRow.group(node));
            if (collapsedGroups.contains(node.key)) return;
            for (UiFence fence : node.fences) rows.add(TreeRow.fence(fence, node.depth + 1));
            for (GroupNode child : node.children.values()) appendNode(child);
        }

        private static String safeName(String value, String fallback) {
            return TextUtils.isEmpty(value) ? fallback : value.trim();
        }

        private String organizationName(String explicitName, String id, String fallback) {
            if (!TextUtils.isEmpty(explicitName)) return explicitName.trim();
            if (!TextUtils.isEmpty(id) && organizationNameById != null) {
                String mapped = organizationNameById.get(id.trim());
                if (!TextUtils.isEmpty(mapped)) return mapped.trim();
            }
            return fallback;
        }

        private static int countFences(GroupNode node) {
            int count = node.fences.size();
            for (GroupNode child : node.children.values()) count += countFences(child);
            return count;
        }

        @Override
        public int getItemViewType(int position) {
            return rows.get(position).group == null ? TYPE_FENCE : TYPE_GROUP;
        }

        @NonNull
        @Override
        public RecyclerView.ViewHolder onCreateViewHolder(@NonNull ViewGroup parent, int viewType) {
            LayoutInflater inflater = LayoutInflater.from(parent.getContext());
            if (viewType == TYPE_GROUP) {
                return new GroupVH(inflater.inflate(R.layout.item_fence_group, parent, false));
            }
            return new FenceVH(inflater.inflate(R.layout.item_fence, parent, false));
        }

        @Override
        public void onBindViewHolder(@NonNull RecyclerView.ViewHolder holder, int position) {
            TreeRow row = rows.get(position);
            if (holder instanceof GroupVH) bindGroup((GroupVH) holder, row.group);
            else bindFence((FenceVH) holder, row.fence, row.depth);
        }

        private void bindGroup(GroupVH holder, GroupNode node) {
            int start = dp(holder.itemView, 10 + node.depth * 16);
            holder.itemView.setPadding(start, holder.itemView.getPaddingTop(),
                    holder.itemView.getPaddingRight(), holder.itemView.getPaddingBottom());
            holder.name.setText(node.name);
            holder.count.setText(String.valueOf(countFences(node)));
            holder.icon.setText("company".equals(node.type) ? "企"
                    : "project".equals(node.type) ? "项"
                    : "grid".equals(node.type) ? "网" : "队");
            holder.arrow.setText(collapsedGroups.contains(node.key) ? "›" : "⌄");
            holder.itemView.setOnClickListener(v -> {
                if (!collapsedGroups.add(node.key)) collapsedGroups.remove(node.key);
                rebuild();
            });
        }

        private void bindFence(FenceVH holder, UiFence fence, int depth) {
            RecyclerView.LayoutParams params = (RecyclerView.LayoutParams) holder.itemView.getLayoutParams();
            params.setMarginStart(dp(holder.itemView, 10 + depth * 16));
            params.setMarginEnd(0);
            holder.itemView.setLayoutParams(params);

            holder.name.setText(TextUtils.isEmpty(fence.name) ? "未命名围栏" : fence.name.trim());
            String behavior = BEHAVIOR_NO_EXIT.equalsIgnoreCase(fence.ruleType) ? "禁出" : "禁入";
            String effectiveTime = normalizeEffectiveTime(fence.effectiveTime);
            if (effectiveTime == null) effectiveTime = "00:00-23:59";
            String shape;
            if ("POLYGON".equalsIgnoreCase(fence.shapeType)) {
                shape = String.format(Locale.CHINA, "多边形 · 点数 %d", fence.points == null ? 0 : fence.points.size());
            } else {
                shape = String.format(Locale.CHINA, "圆形 · 半径 %.0fm",
                        fence.radiusMeters == null ? 50.0 : fence.radiusMeters);
            }
            holder.desc.setText(shape + " · " + behavior + "\n每日生效时段 " + effectiveTime);

            holder.enable.setOnCheckedChangeListener(null);
            holder.enable.setChecked(fence.enabled == null || fence.enabled);
            holder.enable.setOnCheckedChangeListener((buttonView, checked) -> {
                if (onToggle != null) onToggle.onToggle(fence, checked);
            });
            holder.itemView.setOnClickListener(v -> {
                if (onClick != null) onClick.onClick(fence);
            });
            holder.arrow.setOnClickListener(v -> {
                if (onClick != null) onClick.onClick(fence);
            });
            holder.itemView.setOnLongClickListener(v -> {
                if (onLong != null) onLong.onLong(fence);
                return true;
            });
        }

        private static int dp(View view, int value) {
            return Math.round(value * view.getResources().getDisplayMetrics().density);
        }

        @Override public int getItemCount() { return rows.size(); }

        static class GroupNode {
            final String key;
            final String name;
            final int depth;
            String type;
            final Map<String, GroupNode> children = new LinkedHashMap<>();
            final List<UiFence> fences = new ArrayList<>();

            GroupNode(String key, String name, int depth) {
                this.key = key;
                this.name = name;
                this.depth = depth;
            }
        }

        static class TreeRow {
            GroupNode group;
            UiFence fence;
            int depth;

            static TreeRow group(GroupNode group) {
                TreeRow row = new TreeRow();
                row.group = group;
                return row;
            }

            static TreeRow fence(UiFence fence, int depth) {
                TreeRow row = new TreeRow();
                row.fence = fence;
                row.depth = depth;
                return row;
            }
        }

        static class GroupVH extends RecyclerView.ViewHolder {
            final TextView icon;
            final TextView name;
            final TextView count;
            final TextView arrow;

            GroupVH(@NonNull View itemView) {
                super(itemView);
                icon = itemView.findViewById(R.id.tv_group_icon);
                name = itemView.findViewById(R.id.tv_group_name);
                count = itemView.findViewById(R.id.tv_group_count);
                arrow = itemView.findViewById(R.id.tv_group_arrow);
            }
        }

        static class FenceVH extends RecyclerView.ViewHolder {
            final TextView name;
            final TextView desc;
            final SwitchCompat enable;
            final ImageView arrow;

            FenceVH(@NonNull View itemView) {
                super(itemView);
                name = itemView.findViewById(R.id.tv_fence_name);
                desc = itemView.findViewById(R.id.tv_fence_desc);
                enable = itemView.findViewById(R.id.sw_fence_enable);
                arrow = itemView.findViewById(R.id.iv_arrow);
            }
        }
    }

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
            String effectiveTime = normalizeEffectiveTime(f.effectiveTime);
            if (effectiveTime == null) effectiveTime = "00:00-23:59";
            if ("POLYGON".equalsIgnoreCase(f.shapeType)) {
                int n = (f.points == null) ? 0 : f.points.size();
                desc = String.format(Locale.CHINA, "%s · 点数 %d · %s%n每日生效时段 %s",
                        shapeText, n, behText, effectiveTime);
            } else {
                double r = (f.radiusMeters == null) ? 50.0 : f.radiusMeters;
                desc = String.format(Locale.CHINA, "%s · 半径 %.0fm · %s%n每日生效时段 %s",
                        shapeText, r, behText, effectiveTime);
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
        String id;
        String name;
        String company;
        String project;
        String grid;
        String team;
        String branchId;
        String projectId;
        String gridId;
        String teamId;

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
        String scheduleStart;  // schedule.start
        String scheduleEnd;    // schedule.end
        String remark;         // remark

        Integer violationCount = 0;

        static UiFence fromJson(JsonObject o) {
            UiFence f = new UiFence();
            if (o == null) {
                f.points = new ArrayList<>();
                return f;
            }

            f.id = firstNonEmpty(
                    optString(o, "id"),
                    optString(o, "fence_id"),
                    optString(o, "_id")
            );
            f.name = optString(o, "name");
            f.company = firstNonEmpty(optString(o, "company"), optString(o, "department"));
            f.project = firstNonEmpty(optString(o, "project"), optString(o, "project_name"));
            f.grid = firstNonEmpty(optString(o, "grid"), optString(o, "grid_name"));
            f.team = firstNonEmpty(optString(o, "team"), optString(o, "team_name"), optString(o, "workTeam"));
            f.branchId = firstNonEmpty(optString(o, "branch_id"), optString(o, "branchId"));
            f.projectId = firstNonEmpty(optString(o, "project_id"), optString(o, "projectId"));
            f.gridId = firstNonEmpty(optString(o, "grid_id"), optString(o, "gridId"));
            f.teamId = firstNonEmpty(optString(o, "team_id"), optString(o, "teamId"));

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
            JsonObject sched = optJsonObject(o, "schedule");
            if (sched != null) {
                f.scheduleStart = optString(sched, "start");
                f.scheduleEnd = optString(sched, "end");
            }
            f.effectiveTime = normalizeEffectiveTime(optString(o, "effective_time"));
            if (f.effectiveTime == null) {
                if (sched != null) {
                    String start = optString(sched, "start");
                    String end = optString(sched, "end");
                    f.effectiveTime = normalizeEffectiveTime(start + "-" + end);
                }
            }
            if (f.effectiveTime == null) f.effectiveTime = "00:00-23:59";
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
            addStringProperty(body, "company", company);
            addStringProperty(body, "project", project);
            addStringProperty(body, "grid", grid);
            addStringProperty(body, "team", team);
            addStringProperty(body, "branch_id", branchId);
            addStringProperty(body, "project_id", projectId);
            addStringProperty(body, "grid_id", gridId);
            addStringProperty(body, "team_id", teamId);

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

        private static void addStringProperty(JsonObject body, String key, String value) {
            if (body == null || TextUtils.isEmpty(value)) return;
            body.addProperty(key, value.trim());
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

    private static String firstNonEmpty(String... values) {
        if (values == null) return null;
        for (String value : values) {
            if (value != null && !value.trim().isEmpty() && !"null".equalsIgnoreCase(value.trim())) {
                return value.trim();
            }
        }
        return null;
    }

    @Nullable
    private static String normalizeEffectiveTime(String value) {
        if (value == null) return null;
        String[] parts = value.trim().replace('.', ':').split("-", 2);
        if (parts.length != 2) return null;
        int[] start = parseTimePart(parts[0]);
        int[] end = parseTimePart(parts[1]);
        if (start == null || end == null) return null;
        return String.format(Locale.CHINA, "%02d:%02d-%02d:%02d",
                start[0], start[1], end[0], end[1]);
    }

    @Nullable
    private static int[] parseTimePart(String value) {
        if (value == null) return null;
        String[] parts = value.trim().replace('.', ':').split(":", 2);
        if (parts.length != 2) return null;
        try {
            int hour = Integer.parseInt(parts[0]);
            int minute = Integer.parseInt(parts[1]);
            if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
            return new int[]{hour, minute};
        } catch (NumberFormatException ignored) {
            return null;
        }
    }

    private static String formatValidityDateTime(String value) {
        if (value == null || value.trim().isEmpty()) return "永久";
        String text = value.trim().replace('T', ' ');
        int timezoneIndex = Math.max(text.indexOf('Z'), Math.max(text.indexOf('+', 10), text.indexOf('-', 10)));
        if (timezoneIndex > 0) text = text.substring(0, timezoneIndex);
        if (text.length() >= 16) return text.substring(0, 16);
        return text;
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
