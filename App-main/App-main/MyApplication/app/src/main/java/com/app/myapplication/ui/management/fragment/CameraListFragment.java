package com.app.myapplication.ui.management.fragment;

import android.Manifest;
import android.content.pm.PackageManager;
import android.os.Bundle;
import android.text.TextUtils;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;

import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.appcompat.app.AlertDialog;
import androidx.core.content.ContextCompat;
import androidx.recyclerview.widget.LinearLayoutManager;
import androidx.recyclerview.widget.RecyclerView;

import com.app.myapplication.R;
import com.app.myapplication.data.api.ApiClient;
import com.app.myapplication.data.api.CameraRegistrationApi;
import com.app.myapplication.data.model.CameraDevice;
import com.app.myapplication.ui.management.adapter.CameraAdapter;
import com.app.myapplication.ui.scan.QrScanOptions;
import com.google.android.material.dialog.MaterialAlertDialogBuilder;
import com.google.android.material.floatingactionbutton.FloatingActionButton;
import com.google.android.material.textfield.TextInputEditText;
import com.google.android.material.textfield.TextInputLayout;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import com.journeyapps.barcodescanner.ScanContract;
import com.journeyapps.barcodescanner.ScanOptions;

import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;

import retrofit2.Call;
import retrofit2.Callback;
import retrofit2.Response;

public class CameraListFragment extends BaseManagementFragment {

    private RecyclerView recyclerView;
    private CameraAdapter adapter;
    private TextView tvEmpty;
    private TextView tvCount;
    private FloatingActionButton fabAdd;
    private CameraRegistrationApi cameraRegistrationApi;
    private final List<CameraDevice> cameras = new ArrayList<>();
    private CameraQrResult pendingQrResult;

    private final ActivityResultLauncher<ScanOptions> scanLauncher =
            registerForActivityResult(new ScanContract(), result -> {
                if (result == null || TextUtils.isEmpty(result.getContents())) {
                    showToast("未识别到二维码内容");
                    return;
                }
                CameraQrResult qr = parseCameraQrContent(result.getContents());
                if (TextUtils.isEmpty(qr.deviceSerial) && TextUtils.isEmpty(qr.sim_card_id)) {
                    showToast("二维码中未找到设备序列号或SIM卡号");
                    return;
                }
                if (pendingQrResult == null) pendingQrResult = new CameraQrResult();
                pendingQrResult.merge(qr);
                showValidateCodeDialog(pendingQrResult);
            });

    private final ActivityResultLauncher<String> cameraPermissionLauncher =
            registerForActivityResult(new ActivityResultContracts.RequestPermission(), granted -> {
                if (granted) {
                    launchScanner();
                } else {
                    showToast("需要相机权限才能扫码添加摄像头");
                }
            });

    @Nullable
    @Override
    public View onCreateView(@NonNull LayoutInflater inflater, @Nullable ViewGroup container, @Nullable Bundle savedInstanceState) {
        View view = inflater.inflate(R.layout.fragment_camera_list, container, false);
        cameraRegistrationApi = ApiClient.get(requireContext()).create(CameraRegistrationApi.class);
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
            fabAdd.setOnClickListener(v -> startCameraRegistration());
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
        managementApi.getVideos(getAuthHeaders()).enqueue(new Callback<List<JsonObject>>() {
            @Override
            public void onResponse(Call<List<JsonObject>> call, Response<List<JsonObject>> response) {
                hideLoading();
                cameras.clear();
                if (response.isSuccessful() && response.body() != null) {
                    for (JsonObject video : response.body()) {
                        CameraDevice camera = mapVideoToCamera(video);
                        if (camera != null) cameras.add(camera);
                    }
                } else {
                    showToast(response.code() == 401 ? "登录已失效，请重新登录" : "获取设备失败: HTTP " + response.code());
                }
                adapter.notifyDataSetChanged();
                updateUI();
            }

            @Override
            public void onFailure(Call<List<JsonObject>> call, Throwable t) {
                hideLoading();
                cameras.clear();
                adapter.notifyDataSetChanged();
                updateUI();
                showToast("网络错误: " + t.getMessage());
            }
        });
    }

    private CameraDevice mapVideoToCamera(JsonObject video) {
        try {
            String id = jsonString(video, "id");
            String name = first(jsonString(video, "name"), "未知设备");
            String platform = first(jsonString(video, "platform_type"), jsonString(video, "stream_protocol"));
            String rawStatus = jsonString(video, "status");
            String status = "online".equals(rawStatus) ? "在线" : "离线";
            String project = first(jsonString(video, "project"), jsonString(video, "company"));
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

    private void startCameraRegistration() {
        pendingQrResult = null;
        if (ContextCompat.checkSelfPermission(requireContext(), Manifest.permission.CAMERA)
                == PackageManager.PERMISSION_GRANTED) {
            launchScanner();
        } else {
            cameraPermissionLauncher.launch(Manifest.permission.CAMERA);
        }
    }

    private void launchScanner() {
        scanLauncher.launch(QrScanOptions.cameraDevice("请扫描摄像头二维码。小标签请靠近至10-20厘米，避开反光，保持二维码铺满取景框。"));
    }

    private void showValidateCodeDialog(CameraQrResult qr) {
        LinearLayout root = new LinearLayout(requireContext());
        root.setOrientation(LinearLayout.VERTICAL);
        int pad = dp(20);
        root.setPadding(pad, pad / 2, pad, 0);

        TextView summary = new TextView(requireContext());
        summary.setText("设备序列号:\n" + first(qr.deviceSerial, "未识别")
                + "\n\nSIM卡号:\n" + first(qr.sim_card_id, "未识别"));
        summary.setTextSize(14);
        summary.setTextColor(0xFF374151);
        root.addView(summary);

        TextInputLayout inputLayout = new TextInputLayout(requireContext());
        inputLayout.setHint("请输入摄像头验证码");
        inputLayout.setBoxBackgroundMode(TextInputLayout.BOX_BACKGROUND_OUTLINE);
        TextInputEditText editText = new TextInputEditText(inputLayout.getContext());
        editText.setSingleLine(true);
        editText.setText(qr.validateCode);
        inputLayout.addView(editText);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        lp.topMargin = dp(16);
        root.addView(inputLayout, lp);

        AlertDialog dialog = new MaterialAlertDialogBuilder(requireContext())
                .setTitle("自动注册摄像头")
                .setView(root)
                .setNegativeButton("取消", null)
                .setNeutralButton("继续扫码", null)
                .setPositiveButton("确定", null)
                .show();
        Button neutral = dialog.getButton(AlertDialog.BUTTON_NEUTRAL);
        if (neutral != null) {
            neutral.setOnClickListener(v -> {
                qr.validateCode = editText.getText() == null ? "" : editText.getText().toString().trim();
                launchScanner();
                dialog.dismiss();
            });
        }
        Button positive = dialog.getButton(AlertDialog.BUTTON_POSITIVE);
        if (positive != null) {
            positive.setOnClickListener(v -> {
                if (TextUtils.isEmpty(qr.deviceSerial)) {
                    showToast("请先扫描设备序列号二维码");
                    return;
                }
                String validateCode = editText.getText() == null ? "" : editText.getText().toString().trim();
                if (TextUtils.isEmpty(validateCode)) {
                    showToast("请输入摄像头验证码");
                    return;
                }
                qr.validateCode = validateCode;
                dialog.dismiss();
                registerCamera(qr);
            });
        }
    }

    private void registerCamera(CameraQrResult qr) {
        JsonObject request = new JsonObject();
        request.addProperty("device_serial", qr.deviceSerial);
        request.addProperty("camera_password", qr.validateCode);
        request.addProperty("name", qr.deviceSerial);
        if (TextUtils.isEmpty(qr.sim_card_id)) request.add("sim_card_id", null);
        else request.addProperty("sim_card_id", qr.sim_card_id);

        showLoading();
        cameraRegistrationApi.registerCamera(request).enqueue(new Callback<JsonObject>() {
            @Override
            public void onResponse(Call<JsonObject> call, Response<JsonObject> response) {
                hideLoading();
                if (response.isSuccessful() && response.body() != null) {
                    pendingQrResult = null;
                    showRegistrationResult(response.body());
                    loadData();
                } else {
                    showToast("注册请求失败: HTTP " + response.code());
                }
            }

            @Override
            public void onFailure(Call<JsonObject> call, Throwable t) {
                hideLoading();
                showToast("注册请求失败: " + t.getMessage());
            }
        });
    }

    private void showRegistrationResult(JsonObject result) {
        boolean localOk = statusSuccess(result, "local");
        boolean ezvizOk = statusSuccess(result, "ezviz");
        boolean hikiotOk = statusSuccess(result, "hikiot");
        String title = (localOk || ezvizOk || hikiotOk) ? "摄像头添加成功" : "摄像头注册未完成";
        String message = formatStatus("本地系统", result, "local")
                + "\n\n" + formatStatus("萤石云", result, "ezviz")
                + "\n\n" + formatStatus("海康流量卡", result, "hikiot");
        new MaterialAlertDialogBuilder(requireContext())
                .setTitle(title)
                .setMessage(message)
                .setPositiveButton("知道了", null)
                .show();
    }

    private boolean statusSuccess(JsonObject root, String key) {
        if (root == null || !root.has(key) || !root.get(key).isJsonObject()) return false;
        JsonObject item = root.getAsJsonObject(key);
        return item.has("success") && item.get("success").getAsBoolean();
    }

    private String formatStatus(String label, JsonObject root, String key) {
        if (root == null || !root.has(key) || !root.get(key).isJsonObject()) {
            return "× " + label + "\n  未返回状态";
        }
        JsonObject item = root.getAsJsonObject(key);
        boolean success = item.has("success") && item.get("success").getAsBoolean();
        String message = item.has("message") && !item.get("message").isJsonNull()
                ? item.get("message").getAsString()
                : (success ? "成功" : "失败");
        return (success ? "✓ " : "× ") + label + "\n  " + message;
    }

    private CameraQrResult parseCameraQrContent(String raw) {
        CameraQrResult result = new CameraQrResult();
        String text = raw == null ? "" : raw.trim();
        if (TextUtils.isEmpty(text)) return result;

        String[] hikvisionParts = parseHikvisionSingleQr(text);
        if (hikvisionParts != null) {
            result.deviceSerial = hikvisionParts[0];
            result.validateCode = hikvisionParts[1];
            result.model = hikvisionParts[2];
            return result;
        }

        if (text.startsWith("{")) {
            try {
                JsonObject obj = JsonParser.parseString(text).getAsJsonObject();
                result.deviceSerial = first(jsonStringAnyCase(obj, "deviceSerial"), jsonStringAnyCase(obj, "sn"));
                result.deviceSerial = first(result.deviceSerial, jsonStringAnyCase(obj, "serial"));
                result.validateCode = first(jsonStringAnyCase(obj, "validateCode"), jsonStringAnyCase(obj, "validate_code"));
                result.sim_card_id = first(jsonStringAnyCase(obj, "simCardId"), jsonStringAnyCase(obj, "sim_card_id"));
                result.sim_card_id = first(result.sim_card_id, jsonStringAnyCase(obj, "iccid"));
                return result;
            } catch (Exception ignored) {
            }
        }

        result.deviceSerial = first(findQueryLikeValue(text, "deviceSerial"), findQueryLikeValue(text, "sn"));
        result.deviceSerial = first(result.deviceSerial, findQueryLikeValue(text, "serial"));
        result.validateCode = first(findQueryLikeValue(text, "validateCode"), findQueryLikeValue(text, "validate_code"));
        result.sim_card_id = first(findQueryLikeValue(text, "simCardId"), findQueryLikeValue(text, "sim_card_id"));
        result.sim_card_id = first(result.sim_card_id, findQueryLikeValue(text, "iccid"));
        if (TextUtils.isEmpty(result.deviceSerial) && TextUtils.isEmpty(result.sim_card_id)) {
            if (looksLikeIccid(text)) result.sim_card_id = digitsOnly(text);
            else result.deviceSerial = text;
        }
        return result;
    }

    private String[] parseHikvisionSingleQr(String text) {
        if (TextUtils.isEmpty(text)) return null;
        String lower = text.toLowerCase();
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

    private String findQueryLikeValue(String text, String key) {
        if (TextUtils.isEmpty(text)) return "";
        String normalized = text.replace('\n', '&').replace('\r', '&');
        String[] parts = normalized.split("[?&#]");
        String prefix = key.toLowerCase() + "=";
        for (String part : parts) {
            for (String pair : part.split("&")) {
                String trimmed = pair.trim();
                if (trimmed.toLowerCase().startsWith(prefix)) {
                    return decode(trimmed.substring(prefix.length())).trim();
                }
            }
        }
        return "";
    }

    private String jsonString(JsonObject obj, String key) {
        if (obj == null || !obj.has(key) || obj.get(key).isJsonNull()) return "";
        return obj.get(key).getAsString().trim();
    }

    private String jsonStringAnyCase(JsonObject obj, String key) {
        String direct = jsonString(obj, key);
        if (!TextUtils.isEmpty(direct) || obj == null) return direct;
        for (String candidate : obj.keySet()) {
            if (candidate.equalsIgnoreCase(key) && !obj.get(candidate).isJsonNull()) {
                return obj.get(candidate).getAsString().trim();
            }
        }
        return "";
    }

    private boolean looksLikeIccid(String value) {
        String digits = digitsOnly(value);
        return digits.length() == 20 && digits.startsWith("8986");
    }

    private String digitsOnly(String value) {
        return value == null ? "" : value.replaceAll("\\D+", "");
    }

    private String decode(String value) {
        try {
            return URLDecoder.decode(value, StandardCharsets.UTF_8.name());
        } catch (Exception ignored) {
            return value;
        }
    }

    private String first(String a, String b) {
        return TextUtils.isEmpty(a) ? (b == null ? "" : b) : a;
    }

    private int dp(int value) {
        return (int) (value * getResources().getDisplayMetrics().density + 0.5f);
    }

    private static class CameraQrResult {
        String deviceSerial = "";
        String validateCode = "";
        String sim_card_id = "";
        String model = "";

        void merge(CameraQrResult other) {
            if (other == null) return;
            if (!TextUtils.isEmpty(other.deviceSerial)) deviceSerial = other.deviceSerial;
            if (!TextUtils.isEmpty(other.validateCode)) validateCode = other.validateCode;
            if (!TextUtils.isEmpty(other.sim_card_id)) sim_card_id = other.sim_card_id;
            if (!TextUtils.isEmpty(other.model)) model = other.model;
        }
    }
}
