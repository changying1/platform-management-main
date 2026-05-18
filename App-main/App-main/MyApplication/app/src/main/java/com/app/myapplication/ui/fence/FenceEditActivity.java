package com.app.myapplication.ui.fence;

import android.os.Bundle;
import android.text.TextUtils;
import android.widget.ArrayAdapter;
import android.widget.Button;
import android.widget.EditText;
import android.widget.Spinner;
import android.widget.Switch;
import android.widget.Toast;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.appcompat.app.AppCompatActivity;

import com.amap.api.maps.AMap;
import com.amap.api.maps.CameraUpdateFactory;
import com.amap.api.maps.MapView;
import com.amap.api.maps.model.CircleOptions;
import com.amap.api.maps.model.LatLng;
import com.amap.api.maps.model.MarkerOptions;

import com.app.myapplication.R;
import com.app.myapplication.data.api.ApiClient;
import com.app.myapplication.data.model.FenceItem;
import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;

import retrofit2.Call;
import retrofit2.Callback;
import retrofit2.Response;
import retrofit2.Retrofit;
import retrofit2.http.*;

public class FenceEditActivity extends AppCompatActivity {

    // ✅ 用 int id（与后端一致）。传 -1 代表新建
    public static final String EXTRA_FENCE_ID = "extra_fence_id";

    // ---- UI ----
    private EditText etName, etLat, etLng, etRadius;
    private Spinner spTrigger;
    private Switch swEnable;
    private Button btnSave, btnDelete;

    // ---- AMap ----
    private MapView mapView;
    private AMap aMap;
    private LatLng pickedLatLng; // 当前选中的围栏中心点

    // ---- Data ----
    private FenceItem editing;

    // ---- Retrofit API（如果你项目里已有 FenceApi，就删掉这里，换成引用你的那个） ----
    interface FenceApi {
        @GET("fence/")
        Call<JsonArray> getFences(@Query("skip") int skip, @Query("limit") int limit);

        @POST("fence/")
        Call<JsonObject> createFence(@Body JsonObject body);

        @PUT("fence/{fence_id}")
        Call<JsonObject> updateFence(@Path("fence_id") int id, @Body JsonObject body);

        @DELETE("fence/{fence_id}")
        Call<JsonObject> deleteFence(@Path("fence_id") int id);
    }

    private FenceApi api;

    @Override
    protected void onCreate(@Nullable Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_fence_edit);

        Retrofit rf = ApiClient.get(getApplicationContext());
        api = rf.create(FenceApi.class);

        // --- bind views ---
        etName = findViewById(R.id.et_fence_name);
        etLat = findViewById(R.id.et_fence_lat);
        etLng = findViewById(R.id.et_fence_lng);
        etRadius = findViewById(R.id.et_fence_radius);
        spTrigger = findViewById(R.id.sp_trigger_type);
        swEnable = findViewById(R.id.sw_enable);
        btnSave = findViewById(R.id.btn_save);
        btnDelete = findViewById(R.id.btn_delete);

        // 触发类型 Spinner
        String[] items = new String[]{"进入+离开", "进入", "离开"};
        ArrayAdapter<String> triggerAdapter =
                new ArrayAdapter<>(this, android.R.layout.simple_spinner_dropdown_item, items);
        spTrigger.setAdapter(triggerAdapter);

        // --- init map ---
        mapView = findViewById(R.id.mapView);
        mapView.onCreate(savedInstanceState);
        aMap = mapView.getMap();

        // 默认镜头
        LatLng defaultCenter = new LatLng(31.2304, 121.4737); // 上海
        aMap.moveCamera(CameraUpdateFactory.newLatLngZoom(defaultCenter, 12f));

        // 点击地图选点：写入经纬度 + 画圆预览
        aMap.setOnMapClickListener(latLng -> {
            pickedLatLng = latLng;
            etLat.setText(String.valueOf(latLng.latitude));
            etLng.setText(String.valueOf(latLng.longitude));
            aMap.moveCamera(CameraUpdateFactory.newLatLngZoom(pickedLatLng, 16f));
            redrawCirclePreview();
        });

        // 半径失焦更新预览
        etRadius.setOnFocusChangeListener((v, hasFocus) -> {
            if (!hasFocus) redrawCirclePreview();
        });

        // --- load editing/new ---
        int fenceId = getIntent().getIntExtra(EXTRA_FENCE_ID, -1);
        if (fenceId > 0) {
            // 编辑模式：从后端拉列表并找到对应 fence
            loadFenceFromServer(fenceId);
        } else {
            // 新建模式：初始化默认值
            editing = new FenceItem();
            editing.shapeType = "CIRCLE";  // 这个编辑页只做圆形（你的布局也是圆形字段）
            editing.ruleType = "BOTH";
            editing.radiusMeters = 50.0;
            editing.enabled = true;

            btnDelete.setEnabled(false);
            btnDelete.setAlpha(0.5f);

            bindToUi(editing);
        }

        // 保存
        btnSave.setOnClickListener(v -> {
            FenceItem f = collectFromUi(editing);
            if (f == null) return;

            if (f.id == null || f.id <= 0) {
                // 新建：POST
                api.createFence(buildFenceBody(f)).enqueue(new SimpleResp("保存成功(新建)"));
            } else {
                // 更新：PUT
                api.updateFence(f.id, buildFenceBody(f)).enqueue(new SimpleResp("保存成功(更新)"));
            }
        });

        // 删除
        btnDelete.setOnClickListener(v -> {
            if (editing == null || editing.id == null || editing.id <= 0) return;
            api.deleteFence(editing.id).enqueue(new SimpleResp("已删除"));
        });
    }

    // -------------------------
    // Load fence by id (since backend has no GET /fence/{id}, we fetch list and find it)
    // -------------------------
    private void loadFenceFromServer(int fenceId) {
        api.getFences(0, 200).enqueue(new Callback<JsonArray>() {
            @Override
            public void onResponse(@NonNull Call<JsonArray> call, @NonNull Response<JsonArray> resp) {
                if (!resp.isSuccessful() || resp.body() == null) {
                    toast("加载失败 HTTP " + resp.code());
                    initAsNew();
                    return;
                }

                FenceItem found = null;
                for (JsonElement e : resp.body()) {
                    if (!e.isJsonObject()) continue;
                    JsonObject o = e.getAsJsonObject();
                    Integer id = optIntNullable(o, "id", null);
                    if (id != null && id == fenceId) {
                        found = jsonToFenceItem(o);
                        break;
                    }
                }

                if (found == null) {
                    toast("未找到围栏 id=" + fenceId);
                    initAsNew();
                    return;
                }

                editing = found;
                btnDelete.setEnabled(true);
                btnDelete.setAlpha(1f);

                bindToUi(editing);
                showFenceOnMapIfPossible(editing);
            }

            @Override
            public void onFailure(@NonNull Call<JsonArray> call, @NonNull Throwable t) {
                toast("加载失败: " + t.getMessage());
                initAsNew();
            }
        });
    }

    private void initAsNew() {
        editing = new FenceItem();
        editing.shapeType = "CIRCLE";
        editing.ruleType = "BOTH";
        editing.radiusMeters = 50.0;
        editing.enabled = true;

        btnDelete.setEnabled(false);
        btnDelete.setAlpha(0.5f);

        bindToUi(editing);
    }

    // -------------------------
    // UI bind/collect
    // -------------------------
    private void bindToUi(FenceItem f) {
        if (f == null) return;

        etName.setText(f.name == null ? "" : f.name);

        etLat.setText(f.lat == null ? "" : String.valueOf(f.lat));
        etLng.setText(f.lng == null ? "" : String.valueOf(f.lng));

        int r = (f.radiusMeters == null) ? 0 : (int) Math.round(f.radiusMeters);
        etRadius.setText(r == 0 ? "" : String.valueOf(r));

        swEnable.setChecked(f.enabled != null ? f.enabled : true);

        int pos = 0;
        if ("ENTER".equals(f.ruleType)) pos = 1;
        else if ("EXIT".equals(f.ruleType)) pos = 2;
        spTrigger.setSelection(pos);
    }

    private FenceItem collectFromUi(FenceItem f) {
        if (f == null) f = new FenceItem();

        String name = etName.getText().toString().trim();
        String slat = etLat.getText().toString().trim();
        String slng = etLng.getText().toString().trim();
        String srad = etRadius.getText().toString().trim();

        if (TextUtils.isEmpty(name)) {
            toast("请输入围栏名称");
            return null;
        }
        if (TextUtils.isEmpty(slat) || TextUtils.isEmpty(slng)) {
            toast("请点击地图选择中心点（或手动输入经纬度）");
            return null;
        }
        if (TextUtils.isEmpty(srad)) {
            toast("请输入半径（米）");
            return null;
        }

        double lat, lng, rad;
        try {
            lat = Double.parseDouble(slat);
            lng = Double.parseDouble(slng);
            rad = Double.parseDouble(srad);
        } catch (Exception e) {
            toast("经纬度/半径格式不正确");
            return null;
        }

        if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
            toast("经纬度范围不合法");
            return null;
        }
        if (rad < 5 || rad > 20000) {
            toast("半径建议 5m ~ 20000m");
            return null;
        }

        f.name = name;
        f.shapeType = "CIRCLE";
        f.lat = lat;
        f.lng = lng;
        f.radiusMeters = rad;
        f.enabled = swEnable.isChecked();

        int pos = spTrigger.getSelectedItemPosition();
        if (pos == 1) f.ruleType = "ENTER";
        else if (pos == 2) f.ruleType = "EXIT";
        else f.ruleType = "BOTH";

        pickedLatLng = new LatLng(lat, lng);
        redrawCirclePreview();

        return f;
    }

    // -------------------------
    // Map preview
    // -------------------------
    private void showFenceOnMapIfPossible(FenceItem f) {
        if (aMap == null || f == null) return;
        if (f.lat == null || f.lng == null) return;

        pickedLatLng = new LatLng(f.lat, f.lng);
        aMap.moveCamera(CameraUpdateFactory.newLatLngZoom(pickedLatLng, 16f));
        redrawCirclePreview();
    }

    private void redrawCirclePreview() {
        if (aMap == null) return;

        double radius = 50;
        try {
            String s = etRadius.getText().toString().trim();
            if (!s.isEmpty()) radius = Double.parseDouble(s);
        } catch (Exception ignored) {}

        if (pickedLatLng == null) {
            try {
                String slat = etLat.getText().toString().trim();
                String slng = etLng.getText().toString().trim();
                if (!slat.isEmpty() && !slng.isEmpty()) {
                    pickedLatLng = new LatLng(Double.parseDouble(slat), Double.parseDouble(slng));
                }
            } catch (Exception ignored) {}
        }

        if (pickedLatLng == null) return;

        aMap.clear();
        aMap.addMarker(new MarkerOptions().position(pickedLatLng));
        aMap.addCircle(new CircleOptions()
                .center(pickedLatLng)
                .radius(radius)
                .strokeWidth(4f));
    }

    // -------------------------
    // Build request body (对齐后端字段名的关键位置)
    // -------------------------
    private JsonObject buildFenceBody(FenceItem f) {
        // ⚠️ 如果你的后端字段是 snake_case（shape_type / radius_meters 等）
        // 你只需要在这里改字段名即可。
        JsonObject b = new JsonObject();
        if (f.name != null) b.addProperty("name", f.name);
        if (f.shapeType != null) b.addProperty("shapeType", f.shapeType);

        if (f.lat != null) b.addProperty("lat", f.lat);
        if (f.lng != null) b.addProperty("lng", f.lng);
        if (f.radiusMeters != null) b.addProperty("radiusMeters", f.radiusMeters);

        if (f.ruleType != null) b.addProperty("ruleType", f.ruleType);
        if (f.level != null) b.addProperty("level", f.level);
        if (f.enabled != null) b.addProperty("enabled", f.enabled);

        if (f.regionId != null) b.addProperty("regionId", f.regionId);

        if (f.bindDeviceIds != null) {
            JsonArray arr = new JsonArray();
            for (String d : f.bindDeviceIds) arr.add(d);
            b.add("bindDeviceIds", arr);
        }
        return b;
    }

    // -------------------------
    // Retrofit callback helper
    // -------------------------
    private class SimpleResp implements Callback<JsonObject> {
        private final String okMsg;

        SimpleResp(String okMsg) {
            this.okMsg = okMsg;
        }

        @Override
        public void onResponse(@NonNull Call<JsonObject> call, @NonNull Response<JsonObject> resp) {
            if (!resp.isSuccessful()) {
                toast("请求失败 HTTP " + resp.code());
                return;
            }
            toast(okMsg);
            setResult(RESULT_OK);
            finish();
        }

        @Override
        public void onFailure(@NonNull Call<JsonObject> call, @NonNull Throwable t) {
            toast("请求失败: " + t.getMessage());
        }
    }

    // -------------------------
    // JSON -> FenceItem（容错解析）
    // -------------------------
    private FenceItem jsonToFenceItem(JsonObject o) {
        FenceItem f = new FenceItem();
        f.id = optIntNullable(o, "id", null);
        f.name = optStr(o, "name", optStr(o, "fence_name", null));
        f.shapeType = optStr(o, "shapeType", optStr(o, "shape_type", "CIRCLE"));

        f.lat = optDoubleNullable(o, "lat", optDoubleNullable(o, "center_lat", null));
        f.lng = optDoubleNullable(o, "lng", optDoubleNullable(o, "center_lng", null));
        f.radiusMeters = optDoubleNullable(o, "radiusMeters", optDoubleNullable(o, "radius_meters", null));

        f.ruleType = optStr(o, "ruleType", optStr(o, "rule_type", null));
        f.level = optStr(o, "level", optStr(o, "alarm_level", null));
        f.enabled = optBoolNullable(o, "enabled", optBoolNullable(o, "is_enabled", null));

        f.regionId = optIntNullable(o, "regionId", optIntNullable(o, "region_id", null));

        // points / bindDeviceIds 若后端返回你再加也不迟（这个编辑页只用圆形字段）
        return f;
    }

    private static String optStr(JsonObject o, String k, String def) {
        return (o != null && o.has(k) && !o.get(k).isJsonNull()) ? o.get(k).getAsString() : def;
    }

    private static Integer optIntNullable(JsonObject o, String k, Integer def) {
        return (o != null && o.has(k) && !o.get(k).isJsonNull()) ? o.get(k).getAsInt() : def;
    }

    private static Double optDoubleNullable(JsonObject o, String k, Double def) {
        return (o != null && o.has(k) && !o.get(k).isJsonNull()) ? o.get(k).getAsDouble() : def;
    }

    private static Boolean optBoolNullable(JsonObject o, String k, Boolean def) {
        return (o != null && o.has(k) && !o.get(k).isJsonNull()) ? o.get(k).getAsBoolean() : def;
    }

    private void toast(String s) {
        Toast.makeText(this, s, Toast.LENGTH_SHORT).show();
    }

    // ---- MapView lifecycle (必须) ----
    @Override protected void onResume() {
        super.onResume();
        if (mapView != null) mapView.onResume();
    }

    @Override protected void onPause() {
        super.onPause();
        if (mapView != null) mapView.onPause();
    }

    @Override protected void onDestroy() {
        super.onDestroy();
        if (mapView != null) mapView.onDestroy();
    }

    @Override protected void onSaveInstanceState(@NonNull Bundle outState) {
        super.onSaveInstanceState(outState);
        if (mapView != null) mapView.onSaveInstanceState(outState);
    }
}
