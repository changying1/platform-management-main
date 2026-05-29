package com.app.myapplication.ui.video;

import android.app.Application;
import android.text.TextUtils;

import androidx.annotation.NonNull;
import androidx.lifecycle.AndroidViewModel;
import androidx.lifecycle.LiveData;
import androidx.lifecycle.MutableLiveData;

import com.app.myapplication.data.model.VideoDevice;
import com.app.myapplication.data.repo.VideoRepository;

import java.util.ArrayList;
import java.util.List;

public class VideoCenterViewModel extends AndroidViewModel {
    private static final int LOCAL_CAMERA_COUNT = 5;
    private static final int LOCAL_CAMERA_ID_BASE = -10000;

    public static class UiState {
        public List<VideoDevice> allDevices = new ArrayList<>();
        public List<VideoDevice> filteredDevices = new ArrayList<>();
        public List<VideoDevice> selectedDevices = new ArrayList<>();

        public int gridMode = 4;
        public int page = 1;
        public int totalPages = 1;

        public int pageSize = 0;
        public boolean loading = false;
        public String message = "";
        public String error = "";

        // ✅ 主体展示的当前页 tiles（现在基于 filteredDevices）
        public List<VideoDevice> pageTiles = new ArrayList<>();
    }

    private final MutableLiveData<UiState> state = new MutableLiveData<>(new UiState());
    private final VideoRepository repo;

    // ✅ 记住当前搜索关键字（loadDevices 后也能保持过滤）
    private String currentQuery = "";

    public void setPageSize(int size) {
        UiState s = copy();
        s.pageSize = Math.max(1, size);
        s.page = 1;
        recalc(s);
        state.setValue(s);
    }
    public VideoCenterViewModel(@NonNull Application app) {
        super(app);
        repo = new VideoRepository(app);
    }

    public LiveData<UiState> getState() { return state; }

    public void loadDevices() {
        UiState s = copy();
        s.loading = true;
        s.error = "";
        s.message = "";
        state.setValue(s);

        repo.getDevices(new VideoRepository.Result<List<VideoDevice>>() {
            @Override
            public void onOk(List<VideoDevice> data) {
                UiState ns = copy();
                ns.loading = false;

                List<VideoDevice> list = (data == null) ? new ArrayList<>() : data;

                // ✅ 1) allDevices：在线在前、离线在后（保证展示顺序稳定）
                List<VideoDevice> online = new ArrayList<>();
                List<VideoDevice> offline = new ArrayList<>();
                for (VideoDevice d : list) {
                    if (d == null) continue;
                    if (VideoDeviceStatus.isOnline(d)) online.add(d);
                    else offline.add(d);
                }
                ns.allDevices = new ArrayList<>();
                ns.allDevices.addAll(online);
                ns.allDevices.addAll(offline);
                ns.allDevices.addAll(createLocalCameraTiles());

                // ✅ 2) 默认选中在线（保留你原逻辑）
                ns.selectedDevices = new ArrayList<>(online);

                // ✅ 3) 应用“当前搜索关键字”得到 filteredDevices
                ns.filteredDevices = filterByQuery(ns.allDevices, currentQuery);

                // ✅ 4) 重置分页并计算 pageTiles（主体显示）
                ns.page = 1;
                recalc(ns);

                state.postValue(ns);
            }

            @Override public void onErr(String msg) {
                UiState ns = copy();
                ns.loading = false;
                ns.error = msg;
                state.postValue(ns);
            }
        });
    }

    public void addCamera(VideoDevice req) {
        UiState s = copy();
        s.loading = true;
        s.error = "";
        s.message = "";
        state.setValue(s);

        repo.addCamera(req, new VideoRepository.Result<VideoDevice>() {
            @Override
            public void onOk(VideoDevice data) {
                UiState ns = copy();
                ns.loading = false;
                ns.message = "新增成功：" + (data == null || data.getName() == null ? "" : data.getName());
                ns.error = "";
                state.postValue(ns);

                loadDevices();
            }

            @Override
            public void onErr(String msg) {
                UiState ns = copy();
                ns.loading = false;
                ns.error = msg;
                state.postValue(ns);
            }
        });
    }

    // ✅ 新增：更新设备（用于 Drawer 编辑）
    public void updateCamera(VideoDevice req) {
        UiState s = copy();
        s.loading = true;
        s.error = "";
        s.message = "";
        state.setValue(s);

        int id = (req.getId() == null) ? -1 : req.getId();
        if (id <= 0) {
            UiState ns = copy();
            ns.loading = false;
            ns.error = "修改失败：缺少设备ID";
            state.setValue(ns);
            return;
        }

        repo.updateCamera(id, req, new VideoRepository.Result<VideoDevice>() {
            @Override public void onOk(VideoDevice data) {
                UiState ns = copy();
                ns.loading = false;
                ns.message = "修改成功";
                ns.error = "";
                state.postValue(ns);
                loadDevices();
            }

            @Override public void onErr(String msg) {
                UiState ns = copy();
                ns.loading = false;
                ns.error = msg;
                state.postValue(ns);
            }
        });
    }
    public void deleteCamera(int deviceId) {
        UiState s = copy();
        s.loading = true;
        s.error = "";
        s.message = "";
        state.setValue(s);

        repo.deleteCamera(deviceId, new VideoRepository.Result<java.util.Map<String, Object>>() {
            @Override public void onOk(java.util.Map<String, Object> data) {
                UiState ns = copy();
                ns.loading = false;
                ns.message = "删除成功";
                ns.error = "";
                state.postValue(ns);
                loadDevices();
            }

            @Override public void onErr(String msg) {
                UiState ns = copy();
                ns.loading = false;
                ns.error = msg;
                state.postValue(ns);
            }
        });
    }

    // ✅ 搜索：过滤 + 重置页码 + 立刻重算主体 tiles
    public void setSearch(String q) {
        currentQuery = (q == null) ? "" : q.trim();

        UiState s = copy();
        s.filteredDevices = filterByQuery(s.allDevices, currentQuery);

        s.page = 1;
        recalc(s);
        state.setValue(s);
    }

    // 选中/取消选中（用于高亮等，不影响主体分页逻辑）
    public void toggleSelect(VideoDevice device) {
        if (device == null || device.getId() == null) return;

        Integer did = device.getId();
        UiState s = copy();

        boolean exists = false;
        for (VideoDevice d : s.selectedDevices) {
            if (d != null && did.equals(d.getId())) { exists = true; break; }
        }

        if (exists) {
            List<VideoDevice> nd = new ArrayList<>();
            for (VideoDevice d : s.selectedDevices) {
                if (d == null) continue;
                if (!did.equals(d.getId())) nd.add(d);
            }
            s.selectedDevices = nd;
        } else {
            s.selectedDevices.add(device);
        }

        // 不强制翻页，但如果你希望选中后回到第一页，可以打开：
        // s.page = 1;

        recalc(s);
        state.setValue(s);
    }

    public void setGridMode(int mode) {
        UiState s = copy();
        s.gridMode = mode;
        s.page = 1;
        recalc(s);
        state.setValue(s);
    }

    public void nextPage() {
        UiState s = copy();
        if (s.page < s.totalPages) s.page++;
        recalc(s);
        state.setValue(s);
    }

    public void prevPage() {
        UiState s = copy();
        if (s.page > 1) s.page--;
        recalc(s);
        state.setValue(s);
    }

    // ✅ 现在分页/主体 tiles 基于 filteredDevices（你要的联动效果）
    private void recalc(UiState s) {
        int pageSize = (s.pageSize <= 0) ? Math.max(1, s.gridMode) : s.pageSize;

        int total = (s.filteredDevices == null) ? 0 : s.filteredDevices.size();

        s.totalPages = Math.max(1, (int) Math.ceil(total * 1.0 / pageSize));
        if (s.page > s.totalPages) s.page = s.totalPages;

        int start = (s.page - 1) * pageSize;
        int end = Math.min(total, start + pageSize);

        List<VideoDevice> tiles = new ArrayList<>();
        for (int i = start; i < end; i++) tiles.add(s.filteredDevices.get(i));
        s.pageTiles = tiles;
    }

    private List<VideoDevice> filterByQuery(List<VideoDevice> source, String q) {
        if (source == null) return new ArrayList<>();
        if (TextUtils.isEmpty(q)) return new ArrayList<>(source);

        String k = q.toLowerCase();
        List<VideoDevice> out = new ArrayList<>();

        for (VideoDevice d : source) {
            if (d == null) continue;

            String name = firstNonEmpty(d.getName(), d.getStreamUrl()).toLowerCase();

            Integer id = d.getId();
            String idStr = (id == null) ? "" : String.valueOf(id);

            String ip = firstNonEmpty(d.getIpAddress()).toLowerCase();

            if (name.contains(k) || idStr.contains(k) || ip.contains(k)) {
                out.add(d);
            }
        }
        return out;
    }

    private List<VideoDevice> createLocalCameraTiles() {
        List<VideoDevice> out = new ArrayList<>();
        for (int i = 1; i <= LOCAL_CAMERA_COUNT; i++) {
            VideoDevice d = new VideoDevice();
            d.setId(LOCAL_CAMERA_ID_BASE - i);
            d.setName("摄像头 " + i);
            d.setStatus("offline");
            d.setIsActive(0);
            d.setFrontendOnly(true);
            out.add(d);
        }
        return out;
    }

    private UiState copy() {
        UiState s = state.getValue();
        if (s == null) s = new UiState();

        UiState n = new UiState();
        n.allDevices = s.allDevices;
        n.filteredDevices = s.filteredDevices;
        n.selectedDevices = s.selectedDevices;
        n.gridMode = s.gridMode;
        n.page = s.page;
        n.totalPages = s.totalPages;
        n.loading = s.loading;
        n.message = s.message;
        n.error = s.error;
        n.pageTiles = s.pageTiles;
        n.pageSize = s.pageSize;
        return n;
    }

    private String firstNonEmpty(Object... values) {
        for (Object v : values) {
            if (v == null) continue;
            String s = String.valueOf(v).trim();
            if (!s.isEmpty() && !"null".equalsIgnoreCase(s)) return s;
        }
        return "";
    }
    public void clearMessage() {
        UiState s = copy();
        s.message = "";
        state.setValue(s);
    }

    public void clearError() {
        UiState s = copy();
        s.error = "";
        state.setValue(s);
    }
}
