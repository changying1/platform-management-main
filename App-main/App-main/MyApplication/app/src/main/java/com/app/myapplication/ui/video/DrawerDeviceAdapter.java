package com.app.myapplication.ui.video;

import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.ImageView;
import android.widget.TextView;

import androidx.annotation.NonNull;
import androidx.recyclerview.widget.RecyclerView;

import com.app.myapplication.R;
import com.app.myapplication.data.model.VideoDevice;

import java.util.ArrayList;
import java.util.List;

public class DrawerDeviceAdapter extends RecyclerView.Adapter<DrawerDeviceAdapter.VH> {

    public interface OnDeviceClick { void onClick(VideoDevice d); }
    public interface OnDeviceEdit { void onEdit(VideoDevice d); }
    public interface OnDeviceDelete { void onDelete(VideoDevice d); }

    private final OnDeviceClick onClick;
    private final OnDeviceEdit onEdit;
    private final OnDeviceDelete onDelete;

    private final List<VideoDevice> data = new ArrayList<>();

    public DrawerDeviceAdapter(OnDeviceClick onClick, OnDeviceEdit onEdit, OnDeviceDelete onDelete) {
        this.onClick = onClick;
        this.onEdit = onEdit;
        this.onDelete = onDelete;
    }

    public void setData(List<VideoDevice> list) {
        data.clear();
        if (list != null) data.addAll(list);
        notifyDataSetChanged();
    }

    @NonNull @Override
    public VH onCreateViewHolder(@NonNull ViewGroup parent, int viewType) {
        View v = LayoutInflater.from(parent.getContext())
                .inflate(R.layout.item_drawer_device_row, parent, false);
        return new VH(v);
    }

    @Override
    public void onBindViewHolder(@NonNull VH h, int position) {
        VideoDevice d = data.get(position);

        String name = (d.getName() == null || d.getName().trim().isEmpty())
                ? String.valueOf(d.getId())
                : d.getName().trim();

        String ip = (d.getIpAddress() == null) ? "" : d.getIpAddress().trim();
        int port = d.getPort();
        String ipPort = ip.isEmpty() ? "-" : (ip + ":" + port);

        h.tvName.setText(name);
        h.tvIp.setText(ipPort);

        h.itemView.setOnClickListener(v -> {
            if (onClick != null) onClick.onClick(d);
        });

        h.ivEdit.setOnClickListener(v -> {
            if (onEdit != null) onEdit.onEdit(d);
        });

        h.ivDelete.setOnClickListener(v -> {
            if (onDelete != null) onDelete.onDelete(d);
        });
    }

    @Override public int getItemCount() { return data.size(); }

    static class VH extends RecyclerView.ViewHolder {
        TextView tvName, tvIp;
        ImageView ivEdit, ivDelete;
        VH(@NonNull View itemView) {
            super(itemView);
            tvName = itemView.findViewById(R.id.tv_name);
            tvIp = itemView.findViewById(R.id.tv_ip);
            ivEdit = itemView.findViewById(R.id.iv_edit);
            ivDelete = itemView.findViewById(R.id.iv_delete);
        }
    }
}
