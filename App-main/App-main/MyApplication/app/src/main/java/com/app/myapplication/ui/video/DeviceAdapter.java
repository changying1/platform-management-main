package com.app.myapplication.ui.video;

import android.text.TextUtils;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.TextView;

import androidx.annotation.NonNull;
import androidx.recyclerview.widget.RecyclerView;

import com.app.myapplication.R;
import com.app.myapplication.data.model.VideoDevice;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

public class DeviceAdapter extends RecyclerView.Adapter<DeviceAdapter.VH> {

    //    展示设备列表（chip样式），支持点击选择/取消选择，并高亮已选项
    public interface Listener {
        void onClick(VideoDevice item);
    }

    private final Listener listener;

    private final List<VideoDevice> data = new ArrayList<>();
    private final Set<Integer> selectedIds = new HashSet<>();

    public DeviceAdapter(Listener l) {
        this.listener = l;
        setHasStableIds(true);
    }


    public void setData(List<VideoDevice> devices, List<VideoDevice> selected) {
        data.clear();
        if (devices != null) data.addAll(devices);

        selectedIds.clear();
        if (selected != null) {
            for (VideoDevice it : selected) {
                if (it == null) continue;
                Integer id = it.getId();
                if (id != null) selectedIds.add(id);
            }
        }

        notifyDataSetChanged();
    }
    @Override
    public long getItemId(int position) {
        VideoDevice item = data.get(position);
        Integer id = item == null ? null : item.getId();
        return id == null ? RecyclerView.NO_ID : id.hashCode();
    }

    @NonNull
    @Override
    public VH onCreateViewHolder(@NonNull ViewGroup parent, int viewType) {
        View v = LayoutInflater.from(parent.getContext())
                .inflate(R.layout.item_device_chip, parent, false);
        return new VH(v);
    }

    @Override
    public void onBindViewHolder(@NonNull VH h, int pos) {
        VideoDevice item = data.get(pos);
        if (item == null) return;

        String title = firstNonEmpty(item.getName(), item.getId(), item.getStreamUrl());
        h.tvName.setText(title);

        boolean online = item.getIsActive();
        h.tvStatus.setText(online ? "online" : "offline");

        Integer id = item.getId();
        boolean isSel = id != null && selectedIds.contains(id);
        h.itemView.setAlpha(isSel ? 1f : 0.5f);

        h.itemView.setOnClickListener(v -> {
            if (listener != null) listener.onClick(item);
        });
    }

    @Override
    public int getItemCount() {
        return data.size();
    }

    static class VH extends RecyclerView.ViewHolder {
        TextView tvName, tvStatus;
        VH(@NonNull View itemView) {
            super(itemView);
            tvName = itemView.findViewById(R.id.tv_name);
            tvStatus = itemView.findViewById(R.id.tv_status);
        }
    }

    private String firstNonEmpty(Object... values) {
        for (Object v : values) {
            if (v == null) continue;
            String s = String.valueOf(v).trim();
            if (!s.isEmpty() && !"null".equalsIgnoreCase(s)) return s;
        }
        return "";
    }
}
