package com.app.myapplication.ui.video;

import android.content.Intent;
import android.os.Bundle;
import android.text.Editable;
import android.text.TextUtils;
import android.text.TextWatcher;
import android.view.LayoutInflater;
import android.view.View;
import android.widget.Button;
import android.widget.EditText;
import android.widget.ImageView;
import android.widget.TextView;
import android.widget.Toast;

import androidx.appcompat.app.AlertDialog;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.view.GravityCompat;
import androidx.drawerlayout.widget.DrawerLayout;
import androidx.lifecycle.ViewModelProvider;
import androidx.recyclerview.widget.GridLayoutManager;
import androidx.recyclerview.widget.LinearLayoutManager;
import androidx.recyclerview.widget.RecyclerView;

import com.app.myapplication.R;
import com.app.myapplication.data.model.VideoDevice;
import com.google.android.material.chip.Chip;
import com.google.android.material.dialog.MaterialAlertDialogBuilder;

public class VideoCenterActivity extends AppCompatActivity {

    private VideoCenterViewModel vm;

    // Drawer
    private DrawerLayout drawerLayout;
    private ImageView ivOpenDrawer, ivCloseDrawer;
    private EditText etDrawerSearch;
    private RecyclerView rvDrawerDevices;
    private DrawerDeviceAdapter drawerAdapter;

    // 主体
    private RecyclerView rvGrid;
    private VideoTileAdapter tileAdapter;
    private GridLayoutManager gridLayoutManager;

    // 顶部/底部
    private EditText etSearch, etCustomGrid;
    private ImageView ivClear;
    private Button btnAdd, btnPrev, btnNext;
    private TextView tvPage;
    private Chip chip4, chip9;

    private final android.os.Handler gridHandler = new android.os.Handler(android.os.Looper.getMainLooper());
    private Runnable gridRunnable;
    private boolean isApplyingGrid = false;

    @Override protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_video_center);

        vm = new ViewModelProvider(this).get(VideoCenterViewModel.class);

        // Drawer
        drawerLayout = findViewById(R.id.drawer_layout);
        ivOpenDrawer = findViewById(R.id.iv_open_drawer);
        ivCloseDrawer = findViewById(R.id.iv_close_drawer);
        etDrawerSearch = findViewById(R.id.et_drawer_search);
        rvDrawerDevices = findViewById(R.id.rv_drawer_devices);

        // 主体
        rvGrid = findViewById(R.id.rv_video_grid);

        // 顶部
        etSearch = findViewById(R.id.et_search);
        ivClear = findViewById(R.id.iv_clear);
        btnAdd = findViewById(R.id.btn_add);

        // 底部
        chip4 = findViewById(R.id.chip_4);
        chip9 = findViewById(R.id.chip_9);
        etCustomGrid = findViewById(R.id.et_custom_grid);

        btnPrev = findViewById(R.id.btn_prev);
        btnNext = findViewById(R.id.btn_next);
        tvPage = findViewById(R.id.tv_page);

        // Drawer 列表（卡片样式 + 编辑/删除）
        drawerAdapter = new DrawerDeviceAdapter(
                device -> { // 点击设备：进入播放（或你的选中逻辑）
                    openPlay(device);
                    drawerLayout.closeDrawer(GravityCompat.START);
                },
                this::showEditCameraDialog,
                this::confirmDelete
        );
        rvDrawerDevices.setLayoutManager(new LinearLayoutManager(this));
        rvDrawerDevices.setAdapter(drawerAdapter);

        // 主体网格
        tileAdapter = new VideoTileAdapter(this::openPlay);
        gridLayoutManager = new GridLayoutManager(this, 2);
        rvGrid.setLayoutManager(gridLayoutManager);
        rvGrid.setAdapter(tileAdapter);
        // ✅ 初始化默认列数：2列（你现在按钮也是2列/3列）
        gridLayoutManager.setSpanCount(2);



        // 打开/关闭 Drawer
        ivOpenDrawer.setOnClickListener(v -> drawerLayout.openDrawer(GravityCompat.START));
        ivCloseDrawer.setOnClickListener(v -> drawerLayout.closeDrawer(GravityCompat.START));

        // 主页面搜索：动态过滤
        etSearch.addTextChangedListener(new TextWatcher() {
            @Override public void beforeTextChanged(CharSequence s, int start, int count, int after) {}
            @Override public void onTextChanged(CharSequence s, int start, int before, int count) {
                vm.setSearch(s.toString());
            }
            @Override public void afterTextChanged(Editable s) {}
        });
        ivClear.setOnClickListener(v -> etSearch.setText(""));

        // Drawer 搜索：动态过滤（复用同一份过滤）
        etDrawerSearch.addTextChangedListener(new TextWatcher() {
            @Override public void beforeTextChanged(CharSequence s, int start, int count, int after) {}
            @Override public void onTextChanged(CharSequence s, int start, int before, int count) {
                vm.setSearch(s.toString());
            }
            @Override public void afterTextChanged(Editable s) {}
        });

        // 新增
        btnAdd.setOnClickListener(v -> showAddCameraDialog());

        // 格数
        chip4.setChecked(true);
        chip4.setOnClickListener(v -> applyColumns(2));
        chip9.setOnClickListener(v -> applyColumns(3));


        etCustomGrid.addTextChangedListener(new TextWatcher() {
            @Override public void beforeTextChanged(CharSequence s, int start, int count, int after) {}
            @Override public void onTextChanged(CharSequence s, int start, int before, int count) {}
            @Override public void afterTextChanged(Editable s) {
                if (isApplyingGrid) return;
                if (gridRunnable != null) gridHandler.removeCallbacks(gridRunnable);

                gridRunnable = () -> {
                    String text = s.toString().trim();
                    if (text.isEmpty()) return;

                    int cols;
                    try { cols = Integer.parseInt(text); }
                    catch (Exception e) { return; }

                    applyColumns(cols);
                };
                gridHandler.postDelayed(gridRunnable, 350);
            }
        });

        // 分页
        btnPrev.setOnClickListener(v -> vm.prevPage());
        btnNext.setOnClickListener(v -> vm.nextPage());

        // 订阅状态刷新 UI
        vm.getState().observe(this, s -> {

            if (s.message != null && !s.message.isEmpty()) {
                Toast.makeText(this, s.message, Toast.LENGTH_SHORT).show();
                vm.clearMessage();   // ✅ 弹完清空，避免重复
            }

            if (s.error != null && !s.error.isEmpty()) {
                Toast.makeText(this, s.error, Toast.LENGTH_SHORT).show();
                vm.clearError();     // ✅ 同理
            }

            // Drawer：用 filteredDevices 展示（搜索什么就显示什么）
            drawerAdapter.setData(s.filteredDevices);

            // 主体：你要“跟设备列表一致”就用 filteredDevices
            // 如果你后续做分页切片，就换成 s.pageDevices
            tileAdapter.setData(s.filteredDevices);
            tileAdapter.setData(s.pageTiles);              // ✅ 用分页切片
            tvPage.setText(s.page + "/" + s.totalPages);
            if (s.error != null && !s.error.isEmpty()) {
                Toast.makeText(this, s.error, Toast.LENGTH_SHORT).show();
            }
            if (s.message != null && !s.message.isEmpty()) {
                Toast.makeText(this, s.message, Toast.LENGTH_SHORT).show();
            }
        });

        vm.loadDevices();

        // ✅ 等RV真正layout完成后再计算 pageSize（一次不够就post两次）
        rvGrid.post(() -> rvGrid.post(() -> {
            int pageSize = calcPageSizeByViewportExact();
            vm.setPageSize(pageSize); // 这会触发recalc并刷新pageTiles
        }));
    }

    private void openPlay(VideoDevice item) {
        Intent i = new Intent(this, VideoPlayActivity.class);
        i.putExtra("device_id", item.getId());

        String title = (item.getName() == null || item.getName().isEmpty())
                ? "设备 " + item.getId()
                : item.getName();
        i.putExtra("device_name", title);
        startActivity(i);
    }


    // ================= 新增设备（你原逻辑） =================
    private void showAddCameraDialog() {
        View v = LayoutInflater.from(this).inflate(R.layout.dialog_add_camera, null);

        EditText etName = v.findViewById(R.id.et_name);
        EditText etIp = v.findViewById(R.id.et_ip);
        EditText etPort = v.findViewById(R.id.et_port);
        EditText etUser = v.findViewById(R.id.et_user);
        EditText etPass = v.findViewById(R.id.et_pass);
        EditText etStream = v.findViewById(R.id.et_stream);
        EditText etRemark = v.findViewById(R.id.et_remark);

        AlertDialog dialog = new MaterialAlertDialogBuilder(this).setView(v).create();

        v.findViewById(R.id.btn_cancel).setOnClickListener(btn -> dialog.dismiss());

        v.findViewById(R.id.btn_save).setOnClickListener(btn -> {
            String name = etName.getText().toString().trim();
            if (TextUtils.isEmpty(name)) {
                Toast.makeText(this, "设备名称必填", Toast.LENGTH_SHORT).show();
                return;
            }

            VideoDevice req = new VideoDevice();
            req.setName(name);
            req.setIpAddress(etIp.getText().toString().trim());

            String portStr = etPort.getText().toString().trim();
            req.setPort(TextUtils.isEmpty(portStr) ? 80 : Integer.parseInt(portStr));

            req.setUsername(etUser.getText().toString().trim());
            req.password = etPass.getText().toString().trim();
            req.setStreamUrl(etStream.getText().toString().trim());
            req.setRemark(etRemark.getText().toString().trim());

            if (TextUtils.isEmpty(req.getStreamUrl())) {
                Toast.makeText(this, "RTSP 地址不能为空", Toast.LENGTH_SHORT).show();
                return;
            }

            vm.addCamera(req);
            dialog.dismiss();
        });

        dialog.show();
    }

    // ================= 编辑设备（新增） =================
    private void showEditCameraDialog(VideoDevice old) {
        View v = LayoutInflater.from(this).inflate(R.layout.dialog_add_camera, null);

        EditText etName = v.findViewById(R.id.et_name);
        EditText etIp = v.findViewById(R.id.et_ip);
        EditText etPort = v.findViewById(R.id.et_port);
        EditText etUser = v.findViewById(R.id.et_user);
        EditText etPass = v.findViewById(R.id.et_pass);
        EditText etStream = v.findViewById(R.id.et_stream);
        EditText etRemark = v.findViewById(R.id.et_remark);

        // 回填
        etName.setText(old.getName());
        etIp.setText(old.getIpAddress());
        etPort.setText(String.valueOf(old.getPort()));
        etUser.setText(old.getUsername());
        etPass.setText(old.password);
        etStream.setText(old.getStreamUrl());
        etRemark.setText(old.getRemark());

        AlertDialog dialog = new MaterialAlertDialogBuilder(this).setView(v).create();

        v.findViewById(R.id.btn_cancel).setOnClickListener(btn -> dialog.dismiss());

        v.findViewById(R.id.btn_save).setOnClickListener(btn -> {
            String name = etName.getText().toString().trim();
            if (TextUtils.isEmpty(name)) {
                Toast.makeText(this, "设备名称必填", Toast.LENGTH_SHORT).show();
                return;
            }

            VideoDevice req = new VideoDevice();
            req.setId(old.getId()); // ✅ 关键：带上 id 才知道更新哪个
            req.setName(name);
            req.setIpAddress(etIp.getText().toString().trim());

            String portStr = etPort.getText().toString().trim();
            req.setPort(TextUtils.isEmpty(portStr) ? old.getPort() : Integer.parseInt(portStr));

            req.setUsername(etUser.getText().toString().trim());
            req.password = etPass.getText().toString().trim();
            req.setStreamUrl(etStream.getText().toString().trim());
            req.setRemark(etRemark.getText().toString().trim());

            if (TextUtils.isEmpty(req.getStreamUrl())) {
                Toast.makeText(this, "RTSP 地址不能为空", Toast.LENGTH_SHORT).show();
                return;
            }

            // ⚠️ 你需要在 ViewModel 实现这个方法（名字按你项目可调整）
            vm.updateCamera(req);

            dialog.dismiss();
        });

        dialog.show();
    }

    // ================= 删除设备（新增） =================
    private void confirmDelete(VideoDevice d) {
        new MaterialAlertDialogBuilder(this)
                .setTitle("删除设备")
                .setMessage("确认删除 " + (d.getName() == null ? d.getId() : d.getName()) + " 吗？")
                .setNegativeButton("取消", (dialog, which) -> dialog.dismiss())
                .setPositiveButton("删除", (dialog, which) -> {
                    // ⚠️ 你需要在 ViewModel 实现这个方法（名字按你项目可调整）
                    vm.deleteCamera(d.getId());
                })
                .show();
    }

    private int calcPageSizeByViewport(int span) {
        int rvH = rvGrid.getHeight();
        if (rvH <= 0) return span; // 至少一行

        // ✅ 让 RecyclerView 先布局一帧，再去拿 child 的真实高度（否则 childCount=0）
        int childCount = rvGrid.getChildCount();
        if (childCount == 0) {
            // 没 child 的时候保底：一页放 2 行
            return Math.max(1, span * 2);
        }

        View first = rvGrid.getChildAt(0);
        if (first == null || first.getHeight() <= 0) {
            return Math.max(1, span * 2);
        }

        int itemH = first.getHeight();

        int availH = rvH - rvGrid.getPaddingTop() - rvGrid.getPaddingBottom();
        int rows = Math.max(1, availH / itemH);

        return Math.max(1, rows * span);
    }


    private void applyColumns(int cols) {
        if (cols < 1 || cols > 6) {  // 列数别太大，手机上 1~6 足够
            Toast.makeText(this, "列数建议 1~6", Toast.LENGTH_SHORT).show();
            return;
        }

        // chip 状态：2列/3列才高亮
        chip4.setChecked(cols == 2);
        chip9.setChecked(cols == 3);

        // ✅ 1) 改列数
        gridLayoutManager.setSpanCount(cols);
        tileAdapter.setSpanCount(cols); // ✅ 告诉adapter当前列数
        tileAdapter.notifyDataSetChanged();
        rvGrid.post(() -> {
            int pageSize = calcPageSizeByViewportExact();
            vm.setPageSize(pageSize);
        });
        // ✅ 2) 按容器高度计算“一页能放多少”
        int pageSize = calcPageSizeByViewport(cols);

        // ✅ 3) 告诉 ViewModel 用这个 pageSize 分页
        vm.setPageSize(pageSize);

        // ✅ 如果你还想让输入框显示当前列数（可选）
        // isApplyingGrid = true;
        // etCustomGrid.setText(String.valueOf(cols));
        // etCustomGrid.setSelection(etCustomGrid.getText().length());
        // isApplyingGrid = false;
    }

    private int calcPageSizeByViewportExact() {
        int span = gridLayoutManager.getSpanCount();
        if (span <= 0) span = 1;

        int rvH = rvGrid.getHeight();
        if (rvH <= 0) return span * 2;

        if (rvGrid.getChildCount() == 0) return span * 2;

        View first = rvGrid.getChildAt(0);
        if (first == null || first.getHeight() <= 0) return span * 2;

        int itemH = first.getHeight();
        int availH = rvH - rvGrid.getPaddingTop() - rvGrid.getPaddingBottom();
        int rows = Math.max(1, availH / itemH);

        return Math.max(1, rows * span);
    }


}
