package com.app.myapplication.ui.management.adapter;

import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.TextView;

import androidx.annotation.NonNull;
import androidx.recyclerview.widget.RecyclerView;

import com.app.myapplication.R;
import com.app.myapplication.data.model.LocationDevice;

import java.util.List;

/**
 * 定位设备列表适配器
 */
public class LocationDeviceAdapter extends RecyclerView.Adapter<LocationDeviceAdapter.ViewHolder> {

    private List<LocationDevice> devices;

    public LocationDeviceAdapter(List<LocationDevice> devices) {
        this.devices = devices;
    }

    @NonNull
    @Override
    public ViewHolder onCreateViewHolder(@NonNull ViewGroup parent, int viewType) {
        View view = LayoutInflater.from(parent.getContext())
                .inflate(R.layout.item_location_device, parent, false);
        return new ViewHolder(view);
    }

    @Override
    public void onBindViewHolder(@NonNull ViewHolder holder, int position) {
        LocationDevice device = devices.get(position);
        holder.bind(device);
    }

    @Override
    public int getItemCount() {
        return devices.size();
    }

    static class ViewHolder extends RecyclerView.ViewHolder {
        private final TextView tvDeviceId;
        private final TextView tvName;
        private final TextView tvType;
        private final TextView tvStatus;
        private final TextView tvBindPerson;

        public ViewHolder(@NonNull View itemView) {
            super(itemView);
            tvDeviceId = itemView.findViewById(R.id.tv_device_id);
            tvName = itemView.findViewById(R.id.tv_name);
            tvType = itemView.findViewById(R.id.tv_type);
            tvStatus = itemView.findViewById(R.id.tv_status);
            tvBindPerson = itemView.findViewById(R.id.tv_bind_person);
        }

        public void bind(LocationDevice device) {
            tvDeviceId.setText(device.getDeviceId());
            tvName.setText(device.getName());
            tvType.setText(device.getType());
            tvStatus.setText(device.getStatus());
            tvStatus.setTextColor(device.getStatusColor());
            tvBindPerson.setText("绑定人员: " + device.getBindPerson());
        }
    }
}
