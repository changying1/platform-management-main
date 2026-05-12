package com.app.myapplication.ui.fence;

import android.Manifest;
import android.content.pm.PackageManager;
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
import com.app.myapplication.data.api.ApiClient;
import com.google.gson.*;

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
    // Retrofit API（单文件可跑）
    // -------------------------
    interface FenceApi {
        @GET("fence/")
        Call<JsonArray> getFences(@Query("skip") int skip, @Query("limit") int limit);

        @POST("fence/")
        Call<JsonObject> createFence(@Body JsonObject body);

        @PUT("fence/{fence_id}")
        Call<JsonObject> updateFence(@Path("fence_id") int id, @Body JsonObject body);

        @DELETE("fence/{fence_id}")
        Call<JsonObject> deleteFence(@Path("fence_id") int id);

        @GET("fence/regions")
        Call<JsonArray> getRegions(@Query("skip") int skip, @Query("limit") int limit);
    }

    interface DeviceApi {
        @GET("devices/")
        Call<JsonArray> getDevices(@Query("skip") int skip, @Query("limit") int limit);
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
    private Button btnCloseList;

    private FenceListAdapter adapter;

    // -------------------------
    // State
    // -------------------------
    private FenceApi api;
    private DeviceApi deviceApi;

    private final List<UiFence> fences = new ArrayList<>();
    private final List<UiRegion> regions = new ArrayList<>();
    private final List<UiDevice> devices = new ArrayList<>();

    private boolean addMode = false;

    // ✅ 编辑模式
    private boolean editMode = false;
    private Integer editingFenceId = null;
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

        bindViews();
        initRecycler();
        initMap(savedInstanceState);
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
        btnCloseList = findViewById(R.id.btn_close_list);

        // spinner
        List<String> items = new ArrayList<>();
        items.add("禁入（No Entry）");
        items.add("禁出（No Exit）");
        behaviorAdapter = new ArrayAdapter<>(this, android.R.layout.simple_spinner_item, items);
        behaviorAdapter.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item);
        spTriggerType.setAdapter(behaviorAdapter);
    }

    private void initRecycler() {
        rvFence.setLayoutManager(new LinearLayoutManager(this));
        adapter = new FenceListAdapter(
                fences,
                this::showFenceActions,
                this::toggleFenceEnable,
                this::confirmDeleteFence
        );
        rvFence.setAdapter(adapter);
    }

    private void initMap(Bundle savedInstanceState) {
        mapView.onCreate(savedInstanceState);
        aMap = mapView.getMap();

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
            panelList.setVisibility(View.VISIBLE);
            adapter.notifyDataSetChanged();
        });
        btnCloseList.setOnClickListener(v -> panelList.setVisibility(View.GONE));

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

        toast("新增模式：点击地图选圆心 / 多边形模式下点击加点绘制");
    }

    private void enterEditMode(@NonNull UiFence f) {
        if (f.id == null) {
            toast("该围栏没有 id，无法编辑");
            return;
        }

        addMode = true;
        editMode = true;
        editingFenceId = f.id;
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
                    .fillColor(0x22E53935)); // 半透明填充更好看
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
        api.getFences(0, 200).enqueue(new Callback<JsonArray>() {
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
                adapter.notifyDataSetChanged();
                redrawAll();
            }

            @Override
            public void onFailure(@NonNull Call<JsonArray> call, @NonNull Throwable t) {
                toast("拉取围栏失败: " + (t == null ? "unknown" : t.getMessage()));
            }
        });

        api.getRegions(0, 200).enqueue(new Callback<JsonArray>() {
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

        deviceApi.getDevices(0, 1000).enqueue(new Callback<JsonArray>() {
            @Override
            public void onResponse(@NonNull Call<JsonArray> call, @NonNull Response<JsonArray> resp) {
                if (!resp.isSuccessful() || resp.body() == null) return;
                devices.clear();
                for (JsonElement e : resp.body()) {
                    if (e != null && e.isJsonObject()) devices.add(UiDevice.fromJson(e.getAsJsonObject()));
                }
                redrawAll();
            }

            @Override public void onFailure(@NonNull Call<JsonArray> call, @NonNull Throwable t) {}
        });
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
            draft.regionId = editingOrigin.regionId;
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
                draft.points.add(new double[]{p.latitude, p.longitude});
            }
            if (draft.points.size() < 3) {
                toast("多边形点无效，请重新绘制");
                return;
            }
        }

        if (draft.ruleType == null || draft.ruleType.trim().isEmpty()) draft.ruleType = BEHAVIOR_NO_ENTRY;
        if (draft.level == null || draft.level.trim().isEmpty()) draft.level = "medium";
        if (draft.effectiveTime == null || draft.effectiveTime.trim().isEmpty()) draft.effectiveTime = "00:00-23:59";
        if (draft.remark == null) draft.remark = "";

        JsonObject body = draft.buildFenceCreateBody();

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
        api.deleteFence(fence.id).enqueue(new Callback<JsonObject>() {
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

    // ✅ 列表开关：直接更新 is_active（保留原几何/字段）
    private void toggleFenceEnable(@NonNull UiFence fence, boolean newEnabled) {
        if (fence.id == null) return;

        boolean old = fence.enabled != null && fence.enabled;
        fence.enabled = newEnabled;
        adapter.notifyDataSetChanged();
        redrawAll();

        // 用当前 fence 生成 update body（字段不丢）
        // 圆如果 lat/lng 为空，用 best center 补齐一下
        LatLng c = fence.getBestCenterLatLng();
        if (c != null) { fence.lat = c.latitude; fence.lng = c.longitude; }

        JsonObject body = fence.buildFenceCreateBody();

        api.updateFence(fence.id, body).enqueue(new Callback<JsonObject>() {
            @Override
            public void onResponse(@NonNull Call<JsonObject> call, @NonNull Response<JsonObject> resp) {
                if (!resp.isSuccessful()) {
                    fence.enabled = old; // 回滚
                    adapter.notifyDataSetChanged();
                    redrawAll();
                    toast("启用状态更新失败 HTTP " + resp.code());
                    return;
                }
                toast(newEnabled ? "已启用" : "已停用");
            }

            @Override
            public void onFailure(@NonNull Call<JsonObject> call, @NonNull Throwable t) {
                fence.enabled = old; // 回滚
                adapter.notifyDataSetChanged();
                redrawAll();
                toast("启用状态更新失败: " + (t == null ? "unknown" : t.getMessage()));
            }
        });
    }

    // -------------------------
    // List item actions
    // -------------------------
    private void showFenceActions(UiFence f) {
        if (f == null) return;
        String[] items = new String[]{"定位到地图", "编辑", "删除", "查看违规人员"};
        new AlertDialog.Builder(this)
                .setTitle(f.name == null ? "围栏" : f.name)
                .setItems(items, (d, which) -> {
                    if (which == 0) focusFenceOnMap(f);
                    else if (which == 1) enterEditMode(f);
                    else if (which == 2) confirmDeleteFence(f);
                    else showViolationDevicesDialog(f);
                })
                .show();
    }

    private void showViolationDevicesDialog(@NonNull UiFence f) {
        List<String> vio = new ArrayList<>();
        for (UiDevice d : devices) {
            if (d == null || d.last_latitude == null || d.last_longitude == null) continue;
            LatLng p = new LatLng(d.last_latitude, d.last_longitude);
            boolean inside = isInsideFence(p, f);

            boolean violated;
            String beh = (f.ruleType == null) ? BEHAVIOR_NO_ENTRY : f.ruleType;
            if (BEHAVIOR_NO_EXIT.equalsIgnoreCase(beh)) violated = !inside;
            else violated = inside;

            if (violated) {
                String name = (d.device_name == null ? ("设备#" + d.id) : d.device_name);
                String online = (d.is_online != null && d.is_online) ? "在线" : "离线";
                vio.add(name + "（" + online + "）");
            }
        }

        if (vio.isEmpty()) {
            new AlertDialog.Builder(this)
                    .setTitle("违规人员/设备")
                    .setMessage("当前无违规设备")
                    .setPositiveButton("确定", null)
                    .show();
            return;
        }

        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < vio.size(); i++) {
            sb.append(i + 1).append(". ").append(vio.get(i)).append("\n");
        }

        new AlertDialog.Builder(this)
                .setTitle("违规人员/设备（" + vio.size() + "）")
                .setMessage(sb.toString())
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

        // 2) fences（编辑态跳过正在编辑的围栏）
        for (UiFence f : fences) {
            if (f == null) continue;
            if (editMode && editingFenceId != null && editingFenceId.equals(f.id)) continue;

            boolean enabled = (f.enabled == null) || f.enabled;
            int strokeColor;
            int fillColor;

            // 颜色：启用/禁用 + 行为区分
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

        // 5) devices + 违规统计
        drawDevicesAndViolations();

        zoomToOverlaysIfFirstLoad();
    }

    private void drawDevicesAndViolations() {
        if (aMap == null) return;

        Map<Integer, Integer> vioCount = new HashMap<>();

        for (UiDevice d : devices) {
            if (d == null || d.last_latitude == null || d.last_longitude == null) continue;

            LatLng pos = new LatLng(d.last_latitude, d.last_longitude);

            boolean anyViolation = false;

            for (UiFence f : fences) {
                if (f == null || f.id == null) continue;
                if (f.enabled != null && !f.enabled) continue;

                boolean inside = isInsideFence(pos, f);

                boolean violated;
                String beh = (f.ruleType == null) ? BEHAVIOR_NO_ENTRY : f.ruleType;
                if (BEHAVIOR_NO_EXIT.equalsIgnoreCase(beh)) violated = !inside;
                else violated = inside;

                if (violated) {
                    anyViolation = true;
                    int old = vioCount.containsKey(f.id) ? vioCount.get(f.id) : 0;
                    vioCount.put(f.id, old + 1);
                }
            }

            float hue;
            if (anyViolation) hue = BitmapDescriptorFactory.HUE_RED;
            else if (d.is_online != null && d.is_online) hue = BitmapDescriptorFactory.HUE_AZURE;
            else hue = BitmapDescriptorFactory.HUE_ORANGE;

            String title = (d.device_name == null ? ("设备#" + d.id) : d.device_name);
            String snippet = (d.is_online != null && d.is_online)
                    ? (anyViolation ? "在线-违规" : "在线-正常")
                    : (anyViolation ? "离线-违规" : "离线");

            aMap.addMarker(new MarkerOptions()
                    .position(pos)
                    .title(title)
                    .snippet(snippet)
                    .icon(BitmapDescriptorFactory.defaultMarker(hue)));
        }

        for (UiFence f : fences) {
            if (f == null || f.id == null) continue;
            f.violationCount = vioCount.containsKey(f.id) ? vioCount.get(f.id) : 0;
        }

        if (adapter != null) adapter.notifyDataSetChanged();
    }

    private boolean isInsideFence(@NonNull LatLng p, @NonNull UiFence f) {
        if ("POLYGON".equalsIgnoreCase(f.shapeType)) {
            if (f.points == null || f.points.size() < 3) return false;
            List<LatLng> poly = new ArrayList<>();
            for (double[] pt : f.points) {
                if (pt == null || pt.length < 2) continue;
                poly.add(new LatLng(pt[0], pt[1]));
            }
            if (poly.size() < 3) return false;
            return pointInPolygon(p, poly);
        } else {
            LatLng c = f.getBestCenterLatLng();
            if (c == null) return false;
            double r = (f.radiusMeters != null) ? f.radiusMeters : 50.0;
            float d = AMapUtils.calculateLineDistance(c, p);
            return d <= r;
        }
    }

    private boolean pointInPolygon(@NonNull LatLng p, @NonNull List<LatLng> poly) {
        boolean inside = false;
        int n = poly.size();
        for (int i = 0, j = n - 1; i < n; j = i++) {
            double xi = poly.get(i).longitude, yi = poly.get(i).latitude;
            double xj = poly.get(j).longitude, yj = poly.get(j).latitude;
            double x = p.longitude, y = p.latitude;

            boolean intersect = ((yi > y) != (yj > y))
                    && (x < (xj - xi) * (y - yi) / (yj - yi + 1e-12) + xi);
            if (intersect) inside = !inside;
        }
        return inside;
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

        for (UiDevice d : devices) {
            if (d == null || d.last_latitude == null || d.last_longitude == null) continue;
            b.include(new LatLng(d.last_latitude, d.last_longitude));
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
    }

    @Override protected void onPause() {
        super.onPause();
        mapView.onPause();
    }

    @Override protected void onDestroy() {
        super.onDestroy();
        mapView.onDestroy();
    }

    @Override protected void onSaveInstanceState(@NonNull Bundle outState) {
        super.onSaveInstanceState(outState);
        mapView.onSaveInstanceState(outState);
    }

    // -------------------------
    // ✅ 新的列表 Adapter（使用 item_fence.xml）
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

            int vio = (f.violationCount == null) ? 0 : f.violationCount;
            String desc;
            if ("POLYGON".equalsIgnoreCase(f.shapeType)) {
                int n = (f.points == null) ? 0 : f.points.size();
                desc = String.format(Locale.CHINA, "%s · 点数 %d · %s · 违规 %d", shapeText, n, behText, vio);
            } else {
                double r = (f.radiusMeters == null) ? 50.0 : f.radiusMeters;
                desc = String.format(Locale.CHINA, "%s · 半径 %.0fm · %s · 违规 %d", shapeText, r, behText, vio);
            }
            h.tvDesc.setText(desc);

            // 开关
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
    // UI models + 坐标兼容（关键：coordinates_json 默认按 [lng,lat] 解析/生成）
    // -------------------------
    static class UiFence {
        Integer id;
        String name;

        String shapeType; // "CIRCLE" | "POLYGON"

        Double lat;
        Double lng;
        Double radiusMeters;

        // internal 统一存 [lat,lng]
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

            f.id = optIntNullable(o, "id");
            f.name = optString(o, "name");

            String shape = optString(o, "shape");
            if (shape == null) shape = optString(o, "shapeType");
            if (shape != null) {
                if ("polygon".equalsIgnoreCase(shape)) f.shapeType = "POLYGON";
                else if ("circle".equalsIgnoreCase(shape)) f.shapeType = "CIRCLE";
                else f.shapeType = shape.toUpperCase();
            } else {
                f.shapeType = "CIRCLE";
            }

            f.regionId = optIntNullable(o, "project_region_id");
            if (f.regionId == null) f.regionId = optIntNullable(o, "regionId");

            f.radiusMeters = optDoubleNullable(o, "radius");
            if (f.radiusMeters == null) f.radiusMeters = optDoubleNullable(o, "radiusMeters");

            f.lat = optDoubleNullable(o, "lat");
            f.lng = optDoubleNullable(o, "lng");
            if (f.lat == null) f.lat = optDoubleNullable(o, "latitude");
            if (f.lng == null) f.lng = optDoubleNullable(o, "longitude");
            if (f.lat == null) f.lat = optDoubleNullable(o, "center_latitude");
            if (f.lng == null) f.lng = optDoubleNullable(o, "center_longitude");

            String coords = optString(o, "coordinates_json");
            f.points = parsePointsLngLatToLatLng(coords);

            if ("CIRCLE".equalsIgnoreCase(f.shapeType)) {
                if ((f.lat == null || f.lng == null) && f.points != null && !f.points.isEmpty()) {
                    double[] p0 = f.points.get(0);
                    if (p0 != null && p0.length >= 2) {
                        f.lat = p0[0];
                        f.lng = p0[1];
                    }
                }
            }

            f.ruleType = optString(o, "behavior");
            f.level = optString(o, "alarm_type");
            f.enabled = optBoolNullable(o, "is_active");
            f.effectiveTime = optString(o, "effective_time");
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

        public JsonObject buildFenceCreateBody() {
            JsonObject body = new JsonObject();

            body.addProperty("name", (name == null || name.trim().isEmpty()) ? "未命名围栏" : name.trim());

            String shape = (shapeType == null) ? "circle" : shapeType;
            if ("POLYGON".equalsIgnoreCase(shape)) shape = "polygon";
            if ("CIRCLE".equalsIgnoreCase(shape)) shape = "circle";
            body.addProperty("shape", shape);

            body.addProperty("behavior", (ruleType == null || ruleType.trim().isEmpty()) ? BEHAVIOR_NO_ENTRY : ruleType);

            body.addProperty("effective_time",
                    (effectiveTime == null || effectiveTime.trim().isEmpty()) ? "00:00-23:59" : effectiveTime);

            body.addProperty("alarm_type", (level == null || level.trim().isEmpty()) ? "medium" : level);
            body.addProperty("remark", remark == null ? "" : remark);

            body.addProperty("is_active", (enabled != null && enabled) ? 1 : 0);

            if (regionId != null) body.addProperty("project_region_id", regionId);

            double r = (radiusMeters != null) ? radiusMeters : 50.0;
            body.addProperty("radius", r);

            String coordsJson;
            if ("polygon".equalsIgnoreCase(shape)) {
                coordsJson = buildPolygonCoordinatesJsonLngLat(points);
            } else {
                coordsJson = buildCircleCoordinatesJsonLngLat(lat, lng, r, 36);
            }
            if (coordsJson != null) body.addProperty("coordinates_json", coordsJson);

            if (lat != null) body.addProperty("lat", lat);
            if (lng != null) body.addProperty("lng", lng);

            return body;
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

                // ✅ 输出 [lat,lng]（网页端多数用这个；至少你们现网是这个，否则不会“之前还能看到一条边”）
                sb.append(String.format(Locale.US, "[%.6f,%.6f]", p[0], p[1]));
            }

            sb.append("]");
            return sb.toString();
        }




        private static String buildCircleCoordinatesJsonLngLat(Double lat, Double lng, double radiusMeters, int segments) {
            if (lat == null || lng == null) return null;

            int seg = Math.max(24, segments); // 让圆更平滑一点
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

            // ✅ 闭合：补第一个点
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
        int id;
        String name;
        List<double[]> points = new ArrayList<>();

        static UiRegion fromJson(JsonObject o) {
            UiRegion r = new UiRegion();
            if (o == null) return r;

            r.id = optInt(o, "id", 0);
            r.name = optStr(o, "name", optStr(o, "region_name", "未命名区域"));

            String coords = optStr(o, "coordinates_json", null);
            if (coords != null) {
                r.points = parsePointsLngLatToLatLng(coords);
            }
            return r;
        }
    }

    static class UiDevice {
        String id;
        String device_name;
        String ip_address;

        Boolean is_online;
        String stream_url;

        Double last_latitude;
        Double last_longitude;

        static UiDevice fromJson(JsonObject o) {
            UiDevice d = new UiDevice();
            if (o == null) return d;

            d.id = optString(o, "id");
            d.device_name = optString(o, "device_name");
            d.ip_address = optString(o, "ip_address");

            d.is_online = optBoolNullable(o, "is_online");
            d.stream_url = optString(o, "stream_url");

            d.last_latitude = optDoubleNullable(o, "last_latitude");
            d.last_longitude = optDoubleNullable(o, "last_longitude");

            return d;
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
        try { return o.get(key).getAsInt(); } catch (Exception e) { return null; }
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
        return (o != null && o.has(k) && !o.get(k).isJsonNull()) ? o.get(k).getAsInt() : def;
    }

    private static List<double[]> parsePointsLngLatToLatLng(String coordinatesJson) {
        List<double[]> out = new ArrayList<>();
        if (coordinatesJson == null || coordinatesJson.trim().isEmpty()) return out;

        try {
            JSONArray arr = new JSONArray(coordinatesJson);

            // 兼容 A: [[[lng,lat],...]] 这种 ring 结构
            // 如果第一层里面还是 JSONArray，并且它的第 0 项也是 JSONArray，则取 arr[0] 当作点集
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

                // 默认按 [lng,lat]
                double lng = a;
                double lat = b;

                // 自动纠正：如果 lat 超出 [-90,90]，尝试交换
                if (Math.abs(lat) > 90 && Math.abs(a) <= 90 && Math.abs(b) <= 180) {
                    lat = a;
                    lng = b;
                }

                // 过滤非法范围
                if (Math.abs(lat) > 90 || Math.abs(lng) > 180) continue;

                out.add(new double[]{lat, lng}); // 内部统一存 [lat,lng]
            }
        } catch (Exception ignore) {}

        // 如果最后一个点等于第一个点（闭合），Web 端画 polygon 可能不需要重复，
        // 但我们内部也可保留。这里不强制删除。
        return out;
    }

}
