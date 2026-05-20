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

import java.util.ArrayList;
import java.util.List;

import retrofit2.Call;
import retrofit2.Callback;
import retrofit2.Response;
import retrofit2.Retrofit;
import retrofit2.http.*;

/**
 * 围栏编辑Activity - 对齐后端新接口
 */
public class FenceEditActivity extends AppCompatActivity {

    public static final String EXTRA_FENCE_ID = "extra_fence_id";

    // ---- UI ----
    private EditText etName, etLat, etLng, etRadius;
    private Spinner spTrigger;
    private Switch swEnable;
    private Button btnSave, btnDelete;

    // ---- AMap ----
    private MapView mapView;
    private AMap aMap;
    private LatLng pickedLatLng;

    // ---- Data ----
    private FenceItem editing;

    // ---- Retrofit API ----
    interface FenceApi {
        @GET("fence/list")
        Call<JsonArray> getFences();

        @POST("fence/")
        Call<JsonObject> createFence(@Body JsonObject body);

        @PUT("fence/{fence_id}")
        Call<JsonObject> updateFence(@Path("fence_id") String id, @Body JsonObject body);

        @DELETE("fence/delete/{fence_id}")
        Call<JsonObject> deleteFence(@Path("fence_id") String id);
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

        // 触发类型 Spinner - 对齐后端 behavior: No Entry / No Exit
        String[] items = new String[]{"禁入 (No Entry)", "禁出 (No Exit)"};
        ArrayAdapter<String> triggerAdapter =
                new ArrayAdapter<>(this, android.R.layout.simple_spinner_dropdown_item, items);
        spTrigger.setAdapter(triggerAdapter);

        // --- init map ---
        mapView = findViewById(R.id.mapView);
        mapView.onCreate(savedInstanceState);
        aMap = mapView.getMap();

        // 默认镜头
        LatLng defaultCenter = new LatLng(31.2304, 121.4737);
        aMap.moveCamera(CameraUpdateFactory.newLatLngZoom(defaultCenter, 12f));

        // 点击地图选点
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
        String fenceId = getIntent().getStringExtra(EXTRA_FENCE_ID);
        if (fenceId != null && !fenceId.isEmpty()) {
            // 编辑模式
            loadFenceFromServer(fenceId);
        } else {
            // 新建模式
            initAsNew();
        }

        // 保存
        btnSave.setOnClickListener(v -> {
            FenceItem f = collectFromUi(editing);
            if (f == null) return;

            if (f.id == null || f.id.isEmpty()) {
                // 新建
                api.createFence(buildFenceBody(f)).enqueue(new SimpleResp("保存成功"));
            } else {
                // 更新
                api.updateFence(f.id, buildFenceBody(f)).enqueue(new SimpleResp("更新成功"));
            }
        });

        // 删除
        btnDelete.setOnClickListener(v -> {
            if (editing == null || editing.id == null || editing.id.isEmpty()) return;
            api.deleteFence(editing.id).enqueue(new SimpleResp("已删除"));
        });
    }

    private void initAsNew() {
        editing = new FenceItem();
        editing.shape = "circle";
        editing.behavior = "No Entry";
        editing.radius = 50.0;
        editing.is_active = 1;
        editing.severity = "normal";

        btnDelete.setEnabled(false);
        btnDelete.setAlpha(0.5f);

        bindToUi(editing);
    }

    // -------------------------
    // Load fence by id
    // -------------------------
    private void loadFenceFromServer(String fenceId) {
        api.getFences().enqueue(new Callback<JsonArray>() {
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
                    String id = optStr(o, "id", null);
                    if (id != null && id.equals(fenceId)) {
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

    // -------------------------
    // UI bind/collect
    // -------------------------
    private void bindToUi(FenceItem f) {
        if (f == null) return;

        etName.setText(f.name == null ? "" : f.name);

        // center [lat, lng]
        if (f.center != null && f.center.size() >= 2) {
            etLat.setText(String.valueOf(f.center.get(0)));
            etLng.setText(String.valueOf(f.center.get(1)));
        } else {
            etLat.setText("");
            etLng.setText("");
        }

        int r = (f.radius == null) ? 0 : (int) Math.round(f.radius);
        etRadius.setText(r == 0 ? "" : String.valueOf(r));

        swEnable.setChecked(f.is_active != null && f.is_active == 1);

        // behavior: No Entry / No Exit
        int pos = 0;
        if ("No Exit".equals(f.behavior)) pos = 1;
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
        f.shape = "circle";
        f.center = new ArrayList<>();
        f.center.add(lat);
        f.center.add(lng);
        f.radius = rad;
        f.is_active = swEnable.isChecked() ? 1 : 0;

        int pos = spTrigger.getSelectedItemPosition();
        f.behavior = (pos == 1) ? "No Exit" : "No Entry";

        // 默认值
        f.severity = "normal";
        f.company = "";
        f.project = "";

        pickedLatLng = new LatLng(lat, lng);
        redrawCirclePreview();

        return f;
    }

    // -------------------------
    // Map preview
    // -------------------------
    private void showFenceOnMapIfPossible(FenceItem f) {
        if (aMap == null || f == null) return;
        if (f.center == null || f.center.size() < 2) return;

        pickedLatLng = new LatLng(f.center.get(0), f.center.get(1));
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
    // Build request body - 对齐后端新字段
    // -------------------------
    private JsonObject buildFenceBody(FenceItem f) {
        JsonObject b = new JsonObject();

        b.addProperty("name", f.name != null ? f.name : "未命名围栏");
        b.addProperty("shape", "circle");
        b.addProperty("behavior", f.behavior != null ? f.behavior : "No Entry");
        b.addProperty("severity", f.severity != null ? f.severity : "normal");
        b.addProperty("is_active", f.is_active != null ? f.is_active : 1);
        b.addProperty("company", f.company != null ? f.company : "");
        b.addProperty("project", f.project != null ? f.project : "");

        // schedule 对象
        JsonObject schedule = new JsonObject();
        schedule.addProperty("start", "00:00");
        schedule.addProperty("end", "23:59");
        b.add("schedule", schedule);

        // center 数组 [lat, lng]
        if (f.center != null && f.center.size() >= 2) {
            JsonArray centerArr = new JsonArray();
            centerArr.add(f.center.get(0));
            centerArr.add(f.center.get(1));
            b.add("center", centerArr);
        }

        b.addProperty("radius", f.radius != null ? f.radius : 50.0);

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
    // JSON -> FenceItem（对齐后端新字段）
    // -------------------------
    private FenceItem jsonToFenceItem(JsonObject o) {
        FenceItem f = new FenceItem();
        f.id = optStr(o, "id", null);
        f.name = optStr(o, "name", null);
        f.company = optStr(o, "company", "");
        f.project = optStr(o, "project", "");
        f.shape = optStr(o, "shape", "circle");
        f.behavior = optStr(o, "behavior", "No Entry");
        f.severity = optStr(o, "severity", "normal");

        // schedule
        JsonObject sched = o.getAsJsonObject("schedule");
        if (sched != null) {
            f.schedule = new FenceItem.Schedule();
            f.schedule.start = optStr(sched, "start", "00:00");
            f.schedule.end = optStr(sched, "end", "23:59");
        }

        // center [lat, lng]
        JsonArray centerArr = o.getAsJsonArray("center");
        if (centerArr != null && centerArr.size() >= 2) {
            f.center = new ArrayList<>();
            f.center.add(centerArr.get(0).getAsDouble());
            f.center.add(centerArr.get(1).getAsDouble());
        }

        // radius
        if (o.has("radius") && !o.get("radius").isJsonNull()) {
            f.radius = o.get("radius").getAsDouble();
        }

        // is_active
        if (o.has("is_active") && !o.get("is_active").isJsonNull()) {
            f.is_active = o.get("is_active").getAsInt();
        }

        f.createdAt = optStr(o, "createdAt", null);
        f.updatedAt = optStr(o, "updatedAt", null);

        return f;
    }

    private static String optStr(JsonObject o, String k, String def) {
        return (o != null && o.has(k) && !o.get(k).isJsonNull()) ? o.get(k).getAsString() : def;
    }

    private void toast(String s) {
        Toast.makeText(this, s, Toast.LENGTH_SHORT).show();
    }

    // ---- MapView lifecycle ----
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
