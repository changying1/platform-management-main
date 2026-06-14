package com.app.myapplication.ui.management.adapter;

import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.TextView;

import androidx.annotation.NonNull;
import androidx.recyclerview.widget.RecyclerView;

import com.app.myapplication.R;
import com.app.myapplication.data.model.CameraDevice;

import java.util.List;

/**
 * 摄像头列表适配器
 */
public class CameraAdapter extends RecyclerView.Adapter<CameraAdapter.ViewHolder> {

    private List<CameraDevice> cameras;

    public CameraAdapter(List<CameraDevice> cameras) {
        this.cameras = cameras;
    }

    @NonNull
    @Override
    public ViewHolder onCreateViewHolder(@NonNull ViewGroup parent, int viewType) {
        View view = LayoutInflater.from(parent.getContext())
                .inflate(R.layout.item_camera, parent, false);
        return new ViewHolder(view);
    }

    @Override
    public void onBindViewHolder(@NonNull ViewHolder holder, int position) {
        CameraDevice camera = cameras.get(position);
        holder.bind(camera);
    }

    @Override
    public int getItemCount() {
        return cameras.size();
    }

    static class ViewHolder extends RecyclerView.ViewHolder {
        private final TextView tvDeviceId;
        private final TextView tvName;
        private final TextView tvType;
        private final TextView tvStatus;
        private final TextView tvProject;

        public ViewHolder(@NonNull View itemView) {
            super(itemView);
            tvDeviceId = itemView.findViewById(R.id.tv_device_id);
            tvName = itemView.findViewById(R.id.tv_name);
            tvType = itemView.findViewById(R.id.tv_type);
            tvStatus = itemView.findViewById(R.id.tv_status);
            tvProject = itemView.findViewById(R.id.tv_project);
        }

        public void bind(CameraDevice camera) {
            tvDeviceId.setText(camera.getDeviceId());
            tvName.setText(camera.getName());
            tvType.setText(camera.getType());
            tvStatus.setText(camera.getStatus());
            tvStatus.setTextColor(camera.getStatusColor());
            tvProject.setText("项目: " + camera.getProject());
        }
    }
}
