package com.app.myapplication.ui.management.adapter;

import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.CheckBox;
import android.widget.LinearLayout;
import android.widget.TextView;

import androidx.annotation.NonNull;
import androidx.recyclerview.widget.RecyclerView;

import com.app.myapplication.R;
import com.app.myapplication.data.model.Permission;
import com.app.myapplication.data.model.PermissionModule;

import java.util.List;

/**
 * 权限模块适配器
 */
public class PermissionModuleAdapter extends RecyclerView.Adapter<PermissionModuleAdapter.ViewHolder> {

    private List<PermissionModule> modules;
    private OnPermissionChangedListener listener;

    public interface OnPermissionChangedListener {
        void onPermissionChanged(String permissionCode, boolean checked);
    }

    public PermissionModuleAdapter(List<PermissionModule> modules, OnPermissionChangedListener listener) {
        this.modules = modules;
        this.listener = listener;
    }

    @NonNull
    @Override
    public ViewHolder onCreateViewHolder(@NonNull ViewGroup parent, int viewType) {
        View view = LayoutInflater.from(parent.getContext())
                .inflate(R.layout.item_permission_module, parent, false);
        return new ViewHolder(view);
    }

    @Override
    public void onBindViewHolder(@NonNull ViewHolder holder, int position) {
        PermissionModule module = modules.get(position);
        holder.bind(module);
    }

    @Override
    public int getItemCount() {
        return modules.size();
    }

    class ViewHolder extends RecyclerView.ViewHolder {
        private final View colorBar;
        private final TextView tvModuleName;
        private final LinearLayout layoutPermissions;

        public ViewHolder(@NonNull View itemView) {
            super(itemView);
            colorBar = itemView.findViewById(R.id.color_bar);
            tvModuleName = itemView.findViewById(R.id.tv_module_name);
            layoutPermissions = itemView.findViewById(R.id.layout_permissions);
        }

        public void bind(PermissionModule module) {
            colorBar.setBackgroundColor(module.getColorValue());
            tvModuleName.setText(module.getName());
            
            // 清空并重新添加权限项
            layoutPermissions.removeAllViews();
            
            for (Permission permission : module.getPermissions()) {
                CheckBox checkBox = new CheckBox(itemView.getContext());
                checkBox.setText(permission.getName());
                checkBox.setChecked(permission.isChecked());
                checkBox.setOnCheckedChangeListener((buttonView, isChecked) -> {
                    permission.setChecked(isChecked);
                    if (listener != null) {
                        listener.onPermissionChanged(permission.getCode(), isChecked);
                    }
                });
                layoutPermissions.addView(checkBox);
            }
        }
    }
}
