package com.app.myapplication.ui.video;

import android.Manifest;
import android.content.pm.PackageManager;
import android.os.Bundle;
import android.text.TextUtils;
import android.util.Log;
import android.view.Gravity;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.ArrayAdapter;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
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
import androidx.lifecycle.ViewModelProvider;
import androidx.recyclerview.widget.LinearLayoutManager;
import androidx.recyclerview.widget.RecyclerView;

import com.app.myapplication.R;
import com.app.myapplication.data.model.VideoDevice;
import com.app.myapplication.ui.scan.QrScanOptions;
import com.journeyapps.barcodescanner.ScanContract;
import com.journeyapps.barcodescanner.ScanOptions;
import com.google.android.material.button.MaterialButton;
import com.google.android.material.dialog.MaterialAlertDialogBuilder;
import com.google.android.material.textfield.TextInputEditText;
import com.google.android.material.textfield.TextInputLayout;

import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.io.Serializable;
import java.util.ArrayList;
import java.util.List;

public class CameraManagementActivity extends AppCompatActivity {
    private static final String TAG = "CameraManagement";
    private static final String SCAN_TARGET_SERIAL = "serial";
    private static final String SCAN_TARGET_SIM_CARD = "sim_card_id";
    private static final String[] DEVICE_TYPE_OPTIONS = {"枪机", "球机", "执法记录仪", "无人机", "安全帽", "其他"};
    private static final String[] PROJECT_OPTIONS = {"西安地铁8号线", "西安地铁10号线"};
    private static final String[] STATUS_OPTIONS = {"在线", "离线", "故障", "维修中"};

    private VideoCenterViewModel vm;
    private CameraAdapter adapter;
    private TextView tvEmpty;
    private ProgressBar progressBar;
    private Field activeScanField;
    private String activeScanTarget;
    private AlertDialog activeCameraDialog;
    private CameraForm activeCameraForm;
    private CameraFormDraft pendingScanDraft;
    private String pendingScanTarget;
    private boolean waitingForScanResult;
    private boolean waitingForCameraSaveResult;

    private final ActivityResultLauncher<ScanOptions> scanLauncher =
            registerForActivityResult(new ScanContract(), result -> {
                waitingForScanResult = false;
                String target = first(activeScanTarget, pendingScanTarget);
                if (TextUtils.isEmpty(target)) target = SCAN_TARGET_SERIAL;

                if (result == null || TextUtils.isEmpty(result.getContents())) {
                    restoreDialogAfterScan(null, target);
                    return;
                }

                String scannedValue = SCAN_TARGET_SIM_CARD.equals(target)
                        ? extractSimCardIdFromScan(result.getContents())
                        : extractSerialFromScan(result.getContents());

                restoreDialogAfterScan(scannedValue, target);
            });

    private final ActivityResultLauncher<String> cameraPermissionLauncher =
            registerForActivityResult(new ActivityResultContracts.RequestPermission(), granted -> {
                if (granted) {
                    launchScanner();
                } else {
                    waitingForScanResult = false;
                    restoreDialogAfterScan(null, first(activeScanTarget, pendingScanTarget));
                    Toast.makeText(this, "需要相机权限才能扫码", Toast.LENGTH_SHORT).show();
                }
            });

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_camera_management);

        if (savedInstanceState != null) {
            pendingScanDraft = (CameraFormDraft) savedInstanceState.getSerializable("pendingScanDraft");
            pendingScanTarget = savedInstanceState.getString("pendingScanTarget");
            waitingForScanResult = savedInstanceState.getBoolean("waitingForScanResult", false);
        }

        vm = new ViewModelProvider(this).get(VideoCenterViewModel.class);
        tvEmpty = findViewById(R.id.tv_empty);
        progressBar = findViewById(R.id.progress_bar);

        findViewById(R.id.btn_back).setOnClickListener(v -> finish());
        MaterialButton btnAddCamera = findViewById(R.id.btn_add_camera);
        Log.d(TAG, "btnAddCamera=" + btnAddCamera);
        btnAddCamera.setClickable(true);
        btnAddCamera.setFocusable(true);
        btnAddCamera.bringToFront();
        btnAddCamera.setOnClickListener(v -> {
            Log.d(TAG, "add camera clicked");
            Toast.makeText(this, "打开新增摄像头", Toast.LENGTH_SHORT).show();
            showAddCameraDialog(null);
        });

        RecyclerView rv = findViewById(R.id.rv_cameras);
        rv.setLayoutManager(new LinearLayoutManager(this));
        adapter = new CameraAdapter(new CameraAdapter.Actions() {
            @Override public void onEdit(VideoDevice device) { showCameraDialog(device); }
            @Override public void onDelete(VideoDevice device) { confirmDelete(device); }
        });
        rv.setAdapter(adapter);

        vm.getState().observe(this, s -> {
            progressBar.setVisibility(s.loading ? View.VISIBLE : View.GONE);
            if (activeCameraDialog != null && activeCameraDialog.isShowing()) {
                android.widget.Button positive = activeCameraDialog.getButton(AlertDialog.BUTTON_POSITIVE);
                if (positive != null) positive.setEnabled(!s.loading);
            }

            if (!TextUtils.isEmpty(s.message)) {
                Toast.makeText(this, s.message, Toast.LENGTH_SHORT).show();
                if (waitingForCameraSaveResult && s.message.contains("成功")) {
                    closeActiveCameraDialog();
                }
                vm.clearMessage();
            }
            if (!TextUtils.isEmpty(s.error)) {
                Toast.makeText(this, s.error, Toast.LENGTH_SHORT).show();
                waitingForCameraSaveResult = false;
                vm.clearError();
            }

            List<VideoDevice> backendDevices = new ArrayList<>();
            if (s.allDevices != null) {
                for (VideoDevice d : s.allDevices) {
                    if (d != null && !d.isFrontendOnly()) backendDevices.add(d);
                }
            }
            adapter.setData(backendDevices);
            tvEmpty.setVisibility(backendDevices.isEmpty() && !s.loading ? View.VISIBLE : View.GONE);
        });

        vm.loadDevices();

        findViewById(R.id.top_bar).post(() -> btnAddCamera.bringToFront());
    }

    @Override
    protected void onSaveInstanceState(@NonNull Bundle outState) {
        super.onSaveInstanceState(outState);
        CameraFormDraft draft = snapshotActiveForm();
        if (draft != null) {
            pendingScanDraft = draft;
            outState.putSerializable("pendingScanDraft", draft);
        } else if (pendingScanDraft != null) {
            outState.putSerializable("pendingScanDraft", pendingScanDraft);
        }
        if (!TextUtils.isEmpty(first(activeScanTarget, pendingScanTarget))) {
            outState.putString("pendingScanTarget", first(activeScanTarget, pendingScanTarget));
        }
        outState.putBoolean("waitingForScanResult", waitingForScanResult);
    }

    private void showAddCameraDialog(VideoDevice old) {
        showCameraDialog(old);
    }

    private void showCameraDialog(VideoDevice old) {
        showCameraDialog(draftFrom(old));
    }

    private CameraFormDraft draftFrom(VideoDevice d) {
        CameraFormDraft draft = new CameraFormDraft();
        if (d == null) return draft;
        draft.editing = true;
        draft.id = d.getId();
        draft.name = s(d.getName());
        String oldRemark = s(d.getRemark());
        draft.deviceType = normalizeDeviceType(first(d.getDeviceType(), readMeta(oldRemark, "设备类型")));
        draft.serial = s(d.getDeviceSerial());
        draft.simCardId = s(d.getSimCardId());
        draft.channel = String.valueOf(d.getChannelNo() == null ? 1 : d.getChannelNo());
        draft.installLocation = first(d.getInstallLocation(), readMeta(oldRemark, "安装位置"));
        draft.company = s(d.getCompany());
        draft.project = s(d.getProject());
        draft.grid = first(d.getGrid(), readMeta(oldRemark, "所属网格"));
        draft.team = first(d.getTeam(), readMeta(oldRemark, "所属工队"));
        draft.status = statusLabel(first(d.getStatus(), "offline"));
        draft.manager = first(d.getManager(), readMeta(oldRemark, "管理员"));
        draft.managerPhone = first(d.getManagerPhone(), readMeta(oldRemark, "管理员电话"));
        draft.stream = s(d.getStreamUrl());
        draft.remark = stripManagedRemark(oldRemark);
        return draft;
    }

    private void showCameraDialog(CameraFormDraft draft) {
        boolean editing = draft != null && draft.editing;
        ScrollView scrollView = new ScrollView(this);
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        int pad = dp(18);
        root.setPadding(pad, pad, pad, pad);
        scrollView.addView(root, new ScrollView.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));

        TextView title = new TextView(this);
        title.setText(editing ? "编辑摄像头" : "新增摄像头");
        title.setTextSize(20);
        title.setTextColor(0xFF111827);
        title.setTypeface(null, android.graphics.Typeface.BOLD);
        root.addView(title, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));

        Field name = addField(root, "设备名称 *", false);
        Spinner deviceType = addSpinner(root, "设备类型", DEVICE_TYPE_OPTIONS);
        Field serial = addField(root, "机器码/设备序列号", false);
        attachScanAction(serial, SCAN_TARGET_SERIAL);
        Field simCardId = addField(root, "SIM卡卡号", false);
        attachScanAction(simCardId, SCAN_TARGET_SIM_CARD);
        Field channel = addField(root, "通道号", false);
        Field installLocation = addField(root, "安装位置", false);
        Field company = addField(root, "所属分公司", false);
        Spinner project = addSpinner(root, "所属项目", projectOptions(draft == null ? "" : draft.project));
        Field grid = addField(root, "所属网格", false);
        Field team = addField(root, "所属工队", false);
        Spinner status = addSpinner(root, "状态", STATUS_OPTIONS);
        Field manager = addField(root, "管理员", false);
        Field managerPhone = addField(root, "管理员电话", false);
        Field stream = addField(root, "视频流地址", false);
        Field remark = addField(root, "备注", true);

        channel.editText.setText("1");
        CameraForm form = new CameraForm(draft, name, deviceType, serial, simCardId, channel, installLocation,
                company, project, grid, team, status, manager, managerPhone, stream, remark);
        if (draft != null) fillForm(form);

        AlertDialog dialog = new MaterialAlertDialogBuilder(this)
                .setView(scrollView)
                .setNegativeButton("取消", null)
                .setPositiveButton("保存", null)
                .create();
        activeCameraDialog = dialog;
        activeCameraForm = form;

        dialog.setOnShowListener(d -> dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener(v -> {
            String deviceName = value(name);
            if (TextUtils.isEmpty(deviceName)) {
                Toast.makeText(this, "设备名称必填", Toast.LENGTH_SHORT).show();
                return;
            }

            VideoDevice req = new VideoDevice();
            if (editing) req.setId(draft.id);
            req.setName(deviceName);
            req.setDeviceType(selected(deviceType));
            String deviceSerial = value(serial);
            boolean cloudDevice = !TextUtils.isEmpty(deviceSerial);
            req.setPlatformType(cloudDevice ? "ezviz" : "onvif");
            req.setDeviceSerial(deviceSerial);
            req.setSimCardId(value(simCardId));
            req.setChannelNo(parseChannel(value(channel)));
            req.setInstallLocation(value(installLocation));
            req.setCompany(value(company));
            req.setProject(selected(project));
            req.setGrid(value(grid));
            req.setTeam(value(team));
            req.setStatus(statusCode(selected(status)));
            req.setManager(value(manager));
            req.setManagerPhone(value(managerPhone));
            req.setAccessSource(cloudDevice ? "cloud" : "local");
            req.setPtzSource(cloudDevice ? "ezviz" : "onvif");

            String streamUrl = value(stream);
            if (cloudDevice && TextUtils.isEmpty(streamUrl)) {
                streamUrl = buildEzvizUrl(req.getDeviceSerial(), req.getChannelNo());
            }
            req.setStreamUrl(streamUrl);
            req.setStreamProtocol(cloudDevice ? "ezopen" : "flv");
            req.setRemark(buildRemark(value(remark), req));

            if (!cloudDevice && TextUtils.isEmpty(req.getStreamUrl())) {
                Toast.makeText(this, "本地/RTSP设备视频流地址必填", Toast.LENGTH_SHORT).show();
                return;
            }

            if (editing) vm.updateCamera(req);
            else vm.addCamera(req);
            waitingForCameraSaveResult = true;
        }));

        dialog.setOnDismissListener(d -> {
            if (activeCameraDialog == dialog) {
                activeCameraDialog = null;
                activeCameraForm = null;
                waitingForCameraSaveResult = false;
                activeScanField = null;
                activeScanTarget = null;
                if (!waitingForScanResult) {
                    pendingScanDraft = null;
                    pendingScanTarget = null;
                }
            }
        });

        dialog.show();
    }

    private void fillForm(VideoDevice d, Field name, Spinner deviceType, Field serial, Field channel,
                          Field installLocation, Field company, Spinner project, Field grid, Field team,
                          Spinner status, Field manager, Field managerPhone, Field stream, Field remark) {
        name.editText.setText(s(d.getName()));
        String oldRemark = s(d.getRemark());
        setSpinner(deviceType, normalizeDeviceType(first(d.getDeviceType(), readMeta(oldRemark, "设备类型"))));
        serial.editText.setText(s(d.getDeviceSerial()));
        channel.editText.setText(String.valueOf(d.getChannelNo() == null ? 1 : d.getChannelNo()));
        installLocation.editText.setText(first(d.getInstallLocation(), readMeta(oldRemark, "安装位置")));
        company.editText.setText(s(d.getCompany()));
        setSpinner(project, s(d.getProject()));
        grid.editText.setText(first(d.getGrid(), readMeta(oldRemark, "所属网格")));
        team.editText.setText(first(d.getTeam(), readMeta(oldRemark, "所属工队")));
        setSpinner(status, statusLabel(first(d.getStatus(), "offline")));
        manager.editText.setText(first(d.getManager(), readMeta(oldRemark, "管理员")));
        managerPhone.editText.setText(first(d.getManagerPhone(), readMeta(oldRemark, "管理员电话")));
        stream.editText.setText(s(d.getStreamUrl()));
        remark.editText.setText(stripManagedRemark(oldRemark));
    }

    private void fillForm(CameraForm form) {
        CameraFormDraft d = form.draft;
        form.name.editText.setText(s(d.name));
        setSpinner(form.deviceType, normalizeDeviceType(d.deviceType));
        form.serial.editText.setText(s(d.serial));
        form.simCardId.editText.setText(s(d.simCardId));
        form.channel.editText.setText(TextUtils.isEmpty(d.channel) ? "1" : d.channel);
        form.installLocation.editText.setText(s(d.installLocation));
        form.company.editText.setText(s(d.company));
        setSpinner(form.project, s(d.project));
        form.grid.editText.setText(s(d.grid));
        form.team.editText.setText(s(d.team));
        setSpinner(form.status, statusLabel(first(d.status, "offline")));
        form.manager.editText.setText(s(d.manager));
        form.managerPhone.editText.setText(s(d.managerPhone));
        form.stream.editText.setText(s(d.stream));
        form.remark.editText.setText(s(d.remark));
    }

    private CameraFormDraft snapshotActiveForm() {
        if (activeCameraDialog == null || activeCameraForm == null || !activeCameraDialog.isShowing()) {
            return null;
        }
        return CameraFormDraft.from(activeCameraForm);
    }

    private void restoreDialogAfterScan(String scannedValue, String target) {
        String safeTarget = TextUtils.isEmpty(target) ? SCAN_TARGET_SERIAL : target;
        Field targetField = SCAN_TARGET_SIM_CARD.equals(safeTarget)
                ? (activeCameraForm == null ? null : activeCameraForm.simCardId)
                : (activeCameraForm == null ? null : activeCameraForm.serial);

        if (targetField != null && activeCameraDialog != null && activeCameraDialog.isShowing()) {
            if (scannedValue != null) {
                targetField.editText.setText(scannedValue);
                targetField.editText.setSelection(targetField.editText.length());
            }
            clearScanState(true);
            return;
        }

        CameraFormDraft draft = pendingScanDraft;
        if (draft != null) {
            if (scannedValue != null) {
                if (SCAN_TARGET_SIM_CARD.equals(safeTarget)) {
                    draft.simCardId = scannedValue;
                } else {
                    draft.serial = scannedValue;
                }
            }
            clearScanState(true);
            showCameraDialog(draft);
            return;
        }

        clearScanState(true);
    }

    private void closeActiveCameraDialog() {
        AlertDialog dialog = activeCameraDialog;
        activeCameraDialog = null;
        activeCameraForm = null;
        waitingForCameraSaveResult = false;
        clearScanState(true);
        if (dialog != null && dialog.isShowing()) {
            dialog.dismiss();
        }
    }

    private void clearScanState(boolean clearDraft) {
        activeScanField = null;
        activeScanTarget = null;
        pendingScanTarget = null;
        if (clearDraft) pendingScanDraft = null;
    }

    private void confirmDelete(VideoDevice d) {
        if (d == null || d.getId() == null) return;
        new MaterialAlertDialogBuilder(this)
                .setTitle("删除摄像头")
                .setMessage("确认删除 " + first(d.getName(), String.valueOf(d.getId())) + " 吗？")
                .setNegativeButton("取消", null)
                .setPositiveButton("删除", (dialog, which) -> vm.deleteCamera(d.getId()))
                .show();
    }

    private Field addField(LinearLayout parent, String hint, boolean multiLine) {
        TextInputLayout layout = new TextInputLayout(this);
        layout.setHint(hint);
        layout.setBoxBackgroundMode(TextInputLayout.BOX_BACKGROUND_OUTLINE);
        layout.setBoxCornerRadii(dp(12), dp(12), dp(12), dp(12));

        TextInputEditText editText = new TextInputEditText(layout.getContext());
        editText.setSingleLine(!multiLine);
        if (multiLine) {
            editText.setMinLines(3);
            editText.setGravity(Gravity.TOP | Gravity.START);
        }
        layout.addView(editText, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));

        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        lp.topMargin = dp(12);
        parent.addView(layout, lp);
        return new Field(layout, editText);
    }

    private void attachScanAction(Field field, String target) {
        field.layout.setEndIconMode(TextInputLayout.END_ICON_CUSTOM);
        field.layout.setEndIconDrawable(android.R.drawable.ic_menu_camera);
        field.layout.setEndIconContentDescription("扫码");
        field.layout.setEndIconOnClickListener(v -> {
            activeScanField = field;
            activeScanTarget = target;
            pendingScanDraft = snapshotActiveForm();
            pendingScanTarget = target;
            waitingForScanResult = true;
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA)
                    == PackageManager.PERMISSION_GRANTED) {
                launchScanner();
            } else {
                cameraPermissionLauncher.launch(Manifest.permission.CAMERA);
            }
        });
    }

    private void launchScanner() {
        String target = first(activeScanTarget, pendingScanTarget);
        String prompt = SCAN_TARGET_SIM_CARD.equals(target)
                ? "请扫描SIM卡二维码。小标签请靠近至10-20厘米，避开反光，保持二维码铺满取景框。"
                : "请扫描摄像头二维码。小标签请靠近至10-20厘米，避开反光，保持二维码铺满取景框。";
        scanLauncher.launch(QrScanOptions.cameraDevice(prompt));
    }

    private Spinner addSpinner(LinearLayout parent, String label, String[] values) {
        TextView tv = new TextView(this);
        tv.setText(label);
        tv.setTextColor(0xFF374151);
        tv.setTextSize(13);
        LinearLayout.LayoutParams tvLp = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        tvLp.topMargin = dp(12);
        parent.addView(tv, tvLp);

        Spinner spinner = new Spinner(this);
        ArrayAdapter<String> adapter = new ArrayAdapter<>(this,
                android.R.layout.simple_spinner_dropdown_item, values);
        adapter.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item);
        spinner.setAdapter(adapter);
        parent.addView(spinner, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, dp(44)));
        return spinner;
    }

    private String buildRemark(String userRemark, VideoDevice req) {
        StringBuilder sb = new StringBuilder();
        String cleanRemark = stripManagedRemark(userRemark);
        if (!TextUtils.isEmpty(cleanRemark)) sb.append(cleanRemark.trim());
        appendMeta(sb, "设备类型", req.getDeviceType());
        appendMeta(sb, "安装位置", req.getInstallLocation());
        appendMeta(sb, "所属网格", req.getGrid());
        appendMeta(sb, "所属工队", req.getTeam());
        appendMeta(sb, "管理员", req.getManager());
        appendMeta(sb, "管理员电话", req.getManagerPhone());
        return sb.toString();
    }

    private String readMeta(String remark, String label) {
        if (TextUtils.isEmpty(remark)) return "";
        String prefix = label + ":";
        for (String line : remark.split("\\r?\\n")) {
            String item = line.trim();
            if (item.startsWith(prefix)) return item.substring(prefix.length()).trim();
        }
        return "";
    }

    private String stripManagedRemark(String remark) {
        if (TextUtils.isEmpty(remark)) return "";
        StringBuilder sb = new StringBuilder();
        for (String line : remark.split("\\r?\\n")) {
            String item = line.trim();
            if (item.startsWith("安装位置:")
                    || item.startsWith("设备类型:")
                    || item.startsWith("所属网格:")
                    || item.startsWith("所属工队:")
                    || item.startsWith("管理员:")
                    || item.startsWith("管理员电话:")) {
                continue;
            }
            if (sb.length() > 0) sb.append('\n');
            sb.append(line);
        }
        return sb.toString().trim();
    }

    private void appendMeta(StringBuilder sb, String label, String value) {
        if (TextUtils.isEmpty(value)) return;
        if (sb.length() > 0) sb.append('\n');
        sb.append(label).append(": ").append(value.trim());
    }

    private String buildEzvizUrl(String serial, Integer channelNo) {
        return "ezopen://open.ys7.com/" + serial.trim() + "/" + (channelNo == null ? 1 : channelNo);
    }

    private int parseChannel(String text) {
        try {
            int value = Integer.parseInt(text);
            return Math.max(1, value);
        } catch (Exception ignored) {
            return 1;
        }
    }

    private void setSpinner(Spinner spinner, String value) {
        for (int i = 0; i < spinner.getAdapter().getCount(); i++) {
            if (value.equals(spinner.getAdapter().getItem(i))) {
                spinner.setSelection(i);
                return;
            }
        }
    }

    private String[] projectOptions(String project) {
        String oldProject = s(project).trim();
        if (TextUtils.isEmpty(oldProject)) return PROJECT_OPTIONS;
        for (String option : PROJECT_OPTIONS) {
            if (option.equals(oldProject)) return PROJECT_OPTIONS;
        }
        String[] options = new String[PROJECT_OPTIONS.length + 1];
        System.arraycopy(PROJECT_OPTIONS, 0, options, 0, PROJECT_OPTIONS.length);
        options[PROJECT_OPTIONS.length] = oldProject;
        return options;
    }

    private String selected(Spinner spinner) {
        Object item = spinner.getSelectedItem();
        return item == null ? "" : item.toString().trim();
    }

    private String normalizeDeviceType(String value) {
        if (TextUtils.isEmpty(value)) return DEVICE_TYPE_OPTIONS[0];
        for (String option : DEVICE_TYPE_OPTIONS) {
            if (option.equals(value)) return option;
        }
        return "其他";
    }

    private static String statusCode(String label) {
        if ("在线".equals(label) || "online".equalsIgnoreCase(label)) return "online";
        if ("故障".equals(label) || "fault".equalsIgnoreCase(label)) return "fault";
        if ("维修中".equals(label) || "maintenance".equalsIgnoreCase(label)) return "maintenance";
        return "offline";
    }

    private static String statusLabel(String status) {
        if ("在线".equals(status) || "online".equalsIgnoreCase(status)) return "在线";
        if ("故障".equals(status) || "fault".equalsIgnoreCase(status)) return "故障";
        if ("维修中".equals(status) || "maintenance".equalsIgnoreCase(status)) return "维修中";
        if ("离线".equals(status) || "offline".equalsIgnoreCase(status)) return "离线";
        return TextUtils.isEmpty(status) ? "离线" : status;
    }

    private String extractSerialFromScan(String raw) {
        String result = raw == null ? "" : raw.trim();
        String hikvisionSerial = extractHikvisionSerial(result);
        if (!TextUtils.isEmpty(hikvisionSerial)) return hikvisionSerial;
        String serial = findQueryLikeValue(result, "serial");
        if (!TextUtils.isEmpty(serial)) return serial;
        serial = findQueryLikeValue(result, "deviceSerial");
        if (!TextUtils.isEmpty(serial)) return serial;
        serial = findQueryLikeValue(result, "device_serial");
        return TextUtils.isEmpty(serial) ? result : serial;
    }

    private String extractSimCardIdFromScan(String raw) {
        String result = raw == null ? "" : raw.trim();
        String simCardId = findQueryLikeValue(result, "sim_card_id");
        if (!TextUtils.isEmpty(simCardId)) return simCardId;
        simCardId = findQueryLikeValue(result, "simCardId");
        if (!TextUtils.isEmpty(simCardId)) return simCardId;
        simCardId = findQueryLikeValue(result, "iccid");
        if (!TextUtils.isEmpty(simCardId)) return simCardId;
        simCardId = findQueryLikeValue(result, "sim");
        return TextUtils.isEmpty(simCardId) ? result : simCardId;
    }

    private String extractHikvisionSerial(String text) {
        if (TextUtils.isEmpty(text)) return "";
        String lower = text.toLowerCase();
        if (!lower.contains("support.hikvision.com") && !lower.contains("sn=")) return "";

        int snIndex = lower.indexOf("sn=");
        if (snIndex < 0) return "";
        String afterSn = decode(text.substring(snIndex + 3)).trim();
        if (TextUtils.isEmpty(afterSn)) return "";

        String[] lines = afterSn.split("\\r\\n|\\r|\\n");
        for (String rawLine : lines) {
            String line = rawLine.trim();
            if (!TextUtils.isEmpty(line)) return line;
        }
        return "";
    }

    private String findQueryLikeValue(String text, String key) {
        if (TextUtils.isEmpty(text)) return "";
        String[] parts = text.split("[?&#]");
        String prefix = key + "=";
        for (String part : parts) {
            for (String pair : part.split("&")) {
                if (pair.startsWith(prefix)) {
                    return decode(pair.substring(prefix.length())).trim();
                }
            }
        }
        return "";
    }

    private String decode(String value) {
        try {
            return URLDecoder.decode(value, StandardCharsets.UTF_8.name());
        } catch (Exception ignored) {
            return value;
        }
    }

    private String value(Field field) {
        return field.editText.getText() == null ? "" : field.editText.getText().toString().trim();
    }

    private String first(String a, String b) {
        return TextUtils.isEmpty(a) ? b : a;
    }

    private String s(String value) {
        return value == null ? "" : value;
    }

    private int dp(int value) {
        return (int) (value * getResources().getDisplayMetrics().density + 0.5f);
    }

    private static class CameraForm {
        final CameraFormDraft draft;
        final Field name;
        final Spinner deviceType;
        final Field serial;
        final Field simCardId;
        final Field channel;
        final Field installLocation;
        final Field company;
        final Spinner project;
        final Field grid;
        final Field team;
        final Spinner status;
        final Field manager;
        final Field managerPhone;
        final Field stream;
        final Field remark;

        CameraForm(CameraFormDraft draft, Field name, Spinner deviceType, Field serial, Field simCardId, Field channel,
                   Field installLocation, Field company, Spinner project, Field grid, Field team,
                   Spinner status, Field manager, Field managerPhone, Field stream, Field remark) {
            this.draft = draft == null ? new CameraFormDraft() : draft;
            this.name = name;
            this.deviceType = deviceType;
            this.serial = serial;
            this.simCardId = simCardId;
            this.channel = channel;
            this.installLocation = installLocation;
            this.company = company;
            this.project = project;
            this.grid = grid;
            this.team = team;
            this.status = status;
            this.manager = manager;
            this.managerPhone = managerPhone;
            this.stream = stream;
            this.remark = remark;
        }
    }

    private static class CameraFormDraft implements Serializable {
        boolean editing;
        Integer id;
        String name = "";
        String deviceType = "";
        String serial = "";
        String simCardId = "";
        String channel = "1";
        String installLocation = "";
        String company = "";
        String project = "";
        String grid = "";
        String team = "";
        String status = "";
        String manager = "";
        String managerPhone = "";
        String stream = "";
        String remark = "";

        static CameraFormDraft from(CameraForm form) {
            CameraFormDraft draft = new CameraFormDraft();
            draft.editing = form.draft.editing;
            draft.id = form.draft.id;
            draft.name = valueOf(form.name);
            draft.deviceType = selectedOf(form.deviceType);
            draft.serial = valueOf(form.serial);
            draft.simCardId = valueOf(form.simCardId);
            draft.channel = valueOf(form.channel);
            draft.installLocation = valueOf(form.installLocation);
            draft.company = valueOf(form.company);
            draft.project = selectedOf(form.project);
            draft.grid = valueOf(form.grid);
            draft.team = valueOf(form.team);
            draft.status = selectedOf(form.status);
            draft.manager = valueOf(form.manager);
            draft.managerPhone = valueOf(form.managerPhone);
            draft.stream = valueOf(form.stream);
            draft.remark = valueOf(form.remark);
            return draft;
        }

        private static String valueOf(Field field) {
            return field.editText.getText() == null ? "" : field.editText.getText().toString().trim();
        }

        private static String selectedOf(Spinner spinner) {
            Object item = spinner.getSelectedItem();
            return item == null ? "" : item.toString().trim();
        }

    }

    private static class Field {
        final TextInputLayout layout;
        final TextInputEditText editText;
        Field(TextInputLayout layout, TextInputEditText editText) {
            this.layout = layout;
            this.editText = editText;
        }
    }

    private static class CameraAdapter extends RecyclerView.Adapter<CameraAdapter.VH> {
        interface Actions {
            void onEdit(VideoDevice device);
            void onDelete(VideoDevice device);
        }

        private final Actions actions;
        private final List<VideoDevice> data = new ArrayList<>();

        CameraAdapter(Actions actions) {
            this.actions = actions;
        }

        void setData(List<VideoDevice> list) {
            data.clear();
            if (list != null) data.addAll(list);
            notifyDataSetChanged();
        }

        @NonNull
        @Override
        public VH onCreateViewHolder(@NonNull ViewGroup parent, int viewType) {
            View view = LayoutInflater.from(parent.getContext())
                    .inflate(R.layout.item_drawer_device_row, parent, false);
            return new VH(view);
        }

        @Override
        public void onBindViewHolder(@NonNull VH h, int position) {
            VideoDevice d = data.get(position);
            h.name.setText(TextUtils.isEmpty(d.getName()) ? "未命名摄像头" : d.getName());
            StringBuilder info = new StringBuilder();
            if (!TextUtils.isEmpty(d.getDeviceType())) info.append(d.getDeviceType());
            else if (!TextUtils.isEmpty(d.getPlatformType())) info.append(d.getPlatformType());
            if (!TextUtils.isEmpty(d.getCompany())) appendInfo(info, d.getCompany());
            if (!TextUtils.isEmpty(d.getProject())) appendInfo(info, d.getProject());
            if (!TextUtils.isEmpty(d.getStatus())) appendInfo(info, statusLabel(d.getStatus()));
            if (info.length() == 0) info.append(TextUtils.isEmpty(d.getStreamUrl()) ? "未配置视频流" : d.getStreamUrl());
            h.info.setText(info.toString());
            h.edit.setOnClickListener(v -> actions.onEdit(d));
            h.delete.setOnClickListener(v -> actions.onDelete(d));
        }

        private static void appendInfo(StringBuilder sb, String value) {
            if (sb.length() > 0) sb.append(" / ");
            sb.append(value);
        }

        @Override
        public int getItemCount() {
            return data.size();
        }

        static class VH extends RecyclerView.ViewHolder {
            final TextView name;
            final TextView info;
            final View edit;
            final View delete;

            VH(@NonNull View itemView) {
                super(itemView);
                name = itemView.findViewById(R.id.tv_name);
                info = itemView.findViewById(R.id.tv_ip);
                edit = itemView.findViewById(R.id.iv_edit);
                delete = itemView.findViewById(R.id.iv_delete);
            }
        }
    }
}
