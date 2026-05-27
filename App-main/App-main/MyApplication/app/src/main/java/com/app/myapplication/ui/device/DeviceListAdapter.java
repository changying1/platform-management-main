package com.app.myapplication.ui.device;

import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.ImageView;
import android.widget.TextView;

import androidx.annotation.NonNull;
import androidx.recyclerview.widget.RecyclerView;

import com.app.myapplication.R;
import com.app.myapplication.data.model.DeviceItem;

import java.util.ArrayList;
import java.util.List;

/**
 * 设备列表适配器
 */
public class DeviceListAdapter extends RecyclerView.Adapter<DeviceListAdapter.ViewHolder> {

    public interface OnDeviceClickListener {
        void onDeviceClick(DeviceItem device);
        void onDeviceLongClick(DeviceItem device);
    }

    private final List<DeviceItem> devices;
    private final OnDeviceClickListener listener;

    public DeviceListAdapter(List<DeviceItem> devices, OnDeviceClickListener listener) {
        this.devices = devices != null ? devices : new ArrayList<>();
        this.listener = listener;
    }

    @NonNull
    @Override
    public ViewHolder onCreateViewHolder(@NonNull ViewGroup parent, int viewType) {
        View view = LayoutInflater.from(parent.getContext())
                .inflate(R.layout.item_device, parent, false);
        return new ViewHolder(view);
    }

    @Override
    public void onBindViewHolder(@NonNull ViewHolder holder, int position) {
        DeviceItem device = devices.get(position);
        holder.bind(device);

        holder.itemView.setOnClickListener(v -> {
            if (listener != null) listener.onDeviceClick(device);
        });

        holder.itemView.setOnLongClickListener(v -> {
            if (listener != null) listener.onDeviceLongClick(device);
            return true;
        });
    }

    @Override
    public int getItemCount() {
        return devices.size();
    }

    public void updateData(List<DeviceItem> newDevices) {
        devices.clear();
        if (newDevices != null) {
            devices.addAll(newDevices);
        }
        notifyDataSetChanged();
    }

    static class ViewHolder extends RecyclerView.ViewHolder {
        private final ImageView ivStatus;
        private final TextView tvName;
        private final TextView tvInfo;
        private final TextView tvLocation;

        ViewHolder(@NonNull View itemView) {
            super(itemView);
            ivStatus = itemView.findViewById(R.id.iv_device_status);
            tvName = itemView.findViewById(R.id.tv_device_name);
            tvInfo = itemView.findViewById(R.id.tv_device_info);
            tvLocation = itemView.findViewById(R.id.tv_device_location);
        }

        void bind(DeviceItem device) {
            // 设备名称
            tvName.setText(device.name != null ? device.name : "未命名设备");

            // 状态图标
            if (device.isOnline()) {
                ivStatus.setImageResource(R.drawable.ic_status_online);
            } else {
                ivStatus.setImageResource(R.drawable.ic_status_offline);
            }

            // 信息：类型 + 持有人
            StringBuilder info = new StringBuilder();
            if (device.type != null && !device.type.isEmpty()) {
                info.append(device.type);
            }
            if (device.holder != null && !device.holder.isEmpty()) {
                if (info.length() > 0) info.append(" · ");
                info.append("持有人: ").append(device.holder);
            }
            tvInfo.setText(info.toString());

            // 位置信息
            if (device.hasLocation()) {
                tvLocation.setText(String.format("%.6f, %.6f", device.lat, device.lng));
                tvLocation.setVisibility(View.VISIBLE);
            } else {
                tvLocation.setText("无位置信息");
                tvLocation.setVisibility(View.VISIBLE);
            }
        }
    }
}
