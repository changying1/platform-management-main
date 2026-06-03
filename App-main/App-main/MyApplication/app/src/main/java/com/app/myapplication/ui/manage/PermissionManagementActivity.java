package com.app.myapplication.ui.manage;

import android.os.Bundle;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.ImageView;
import android.widget.TextView;

import androidx.annotation.NonNull;
import androidx.appcompat.app.AppCompatActivity;
import androidx.recyclerview.widget.LinearLayoutManager;
import androidx.recyclerview.widget.RecyclerView;

import com.app.myapplication.R;

import java.util.ArrayList;
import java.util.List;

public class PermissionManagementActivity extends AppCompatActivity {

    private RecyclerView rvRoles;
    private RecyclerView rvPermissions;
    private RoleAdapter roleAdapter;
    private PermissionAdapter permissionAdapter;
    private List<RoleItem> roleList = new ArrayList<>();
    private List<PermissionItem> permissionList = new ArrayList<>();
    private int selectedRoleIndex = 0;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_permission_management);

        findViewById(R.id.btn_back).setOnClickListener(v -> finish());

        rvRoles = findViewById(R.id.rv_roles);
        rvPermissions = findViewById(R.id.rv_permissions);

        rvRoles.setLayoutManager(new LinearLayoutManager(this));
        rvPermissions.setLayoutManager(new LinearLayoutManager(this));

        initData();

        roleAdapter = new RoleAdapter();
        rvRoles.setAdapter(roleAdapter);

        permissionAdapter = new PermissionAdapter();
        rvPermissions.setAdapter(permissionAdapter);
    }

    private void initData() {
        // 硬编码角色数据（与前端保持一致）
        roleList.add(new RoleItem("1", "系统管理员", "headquarters_admin", "总部", null, null, "拥有所有系统权限"));
        roleList.add(new RoleItem("2", "中铁一局管理员", "branch_admin", "中铁一局", null, null, "中铁一局全权限"));
        roleList.add(new RoleItem("3", "西安地铁8号线管理员", "project_safety_admin", "中铁一局", "西安地铁8号线", null, "项目管理权限"));
        roleList.add(new RoleItem("4", "土建工队管理员", "team_admin", "中铁一局", "西安地铁8号线", "土建工队", "土建工队管理"));
        roleList.add(new RoleItem("5", "机电工队管理员", "team_admin", "中铁一局", "西安地铁8号线", "机电工队", "机电工队管理"));
        roleList.add(new RoleItem("6", "安全工队管理员", "team_admin", "中铁一局", "西安地铁8号线", "安全工队", "安全工队管理"));
        roleList.add(new RoleItem("7", "西安地铁10号线管理员", "project_safety_admin", "中铁一局", "西安地铁10号线", null, "项目管理权限"));
        roleList.add(new RoleItem("8", "中铁隧道局管理员", "branch_admin", "中铁隧道局", null, null, "隧道局全权限"));
        roleList.add(new RoleItem("9", "隧道工队管理员", "team_admin", "中铁隧道局", "西安地铁10号线", "隧道工队", "隧道工队管理"));

        // 硬编码权限数据
        permissionList.add(new PermissionItem("dashboard.view", "查看仪表板", true));
        permissionList.add(new PermissionItem("monitor.playback", "监控回放", true));
        permissionList.add(new PermissionItem("monitor.track", "轨迹回放", true));
        permissionList.add(new PermissionItem("monitor.voice", "语音回放", true));
        permissionList.add(new PermissionItem("monitor.camera", "摄像头管理", true));
        permissionList.add(new PermissionItem("fence.view", "查看围栏", true));
        permissionList.add(new PermissionItem("fence.create", "创建围栏", true));
        permissionList.add(new PermissionItem("fence.edit", "编辑围栏", true));
        permissionList.add(new PermissionItem("fence.delete", "删除围栏", false));
        permissionList.add(new PermissionItem("device.view", "查看设备", true));
        permissionList.add(new PermissionItem("device.create", "添加设备", true));
        permissionList.add(new PermissionItem("device.edit", "编辑设备", true));
        permissionList.add(new PermissionItem("device.delete", "删除设备", false));
        permissionList.add(new PermissionItem("personnel.view", "查看人员", true));
        permissionList.add(new PermissionItem("personnel.create", "添加人员", true));
        permissionList.add(new PermissionItem("personnel.edit", "编辑人员", true));
        permissionList.add(new PermissionItem("personnel.delete", "删除人员", false));
        permissionList.add(new PermissionItem("project.view", "查看项目", true));
        permissionList.add(new PermissionItem("project.create", "创建项目", false));
        permissionList.add(new PermissionItem("grid.view", "查看网格", true));
        permissionList.add(new PermissionItem("grid.create", "创建网格", false));
    }

    static class RoleItem {
        String id, name, code, company, project, team, description;

        RoleItem(String id, String name, String code, String company, String project, String team, String description) {
            this.id = id;
            this.name = name;
            this.code = code;
            this.company = company;
            this.project = project;
            this.team = team;
            this.description = description;
        }
    }

    static class PermissionItem {
        String code, name;
        boolean granted;

        PermissionItem(String code, String name, boolean granted) {
            this.code = code;
            this.name = name;
            this.granted = granted;
        }
    }

    class RoleAdapter extends RecyclerView.Adapter<RoleAdapter.VH> {

        @NonNull
        @Override
        public VH onCreateViewHolder(@NonNull ViewGroup parent, int viewType) {
            View v = LayoutInflater.from(parent.getContext()).inflate(R.layout.item_role, parent, false);
            return new VH(v);
        }

        @Override
        public void onBindViewHolder(@NonNull VH holder, int position) {
            RoleItem item = roleList.get(position);
            holder.tvName.setText(item.name);
            holder.tvDesc.setText(item.description);

            boolean isSelected = position == selectedRoleIndex;
            holder.itemView.setBackgroundResource(isSelected ? R.drawable.bg_item_box : android.R.color.transparent);
            holder.tvName.setTextColor(isSelected ? getResources().getColor(R.color.purple_500) : getResources().getColor(android.R.color.black));

            holder.itemView.setOnClickListener(v -> {
                selectedRoleIndex = position;
                notifyDataSetChanged();
                // 根据角色级别更新权限显示
                updatePermissionsForRole(item);
            });
        }

        @Override
        public int getItemCount() {
            return roleList.size();
        }

        class VH extends RecyclerView.ViewHolder {
            TextView tvName, tvDesc;

            VH(View itemView) {
                super(itemView);
                tvName = itemView.findViewById(R.id.tv_name);
                tvDesc = itemView.findViewById(R.id.tv_desc);
            }
        }
    }

    class PermissionAdapter extends RecyclerView.Adapter<PermissionAdapter.VH> {

        @NonNull
        @Override
        public VH onCreateViewHolder(@NonNull ViewGroup parent, int viewType) {
            View v = LayoutInflater.from(parent.getContext()).inflate(R.layout.item_permission, parent, false);
            return new VH(v);
        }

        @Override
        public void onBindViewHolder(@NonNull VH holder, int position) {
            PermissionItem item = permissionList.get(position);
            holder.tvName.setText(item.name);
            holder.tvCode.setText(item.code);
            holder.ivCheck.setImageResource(item.granted ? R.drawable.circle_green : R.drawable.circle_gray);
        }

        @Override
        public int getItemCount() {
            return permissionList.size();
        }

        class VH extends RecyclerView.ViewHolder {
            TextView tvName, tvCode;
            ImageView ivCheck;

            VH(View itemView) {
                super(itemView);
                tvName = itemView.findViewById(R.id.tv_name);
                tvCode = itemView.findViewById(R.id.tv_code);
                ivCheck = itemView.findViewById(R.id.iv_check);
            }
        }
    }

    private void updatePermissionsForRole(RoleItem role) {
        // 根据角色级别设置权限
        boolean isAdmin = "headquarters_admin".equals(role.code);
        boolean isBranchAdmin = "branch_admin".equals(role.code);
        boolean isProjectAdmin = "project_safety_admin".equals(role.code);

        for (PermissionItem p : permissionList) {
            if (isAdmin) {
                p.granted = true;
            } else if (isBranchAdmin) {
                p.granted = !p.code.contains("delete") && !p.code.contains("create");
            } else if (isProjectAdmin) {
                p.granted = p.code.contains("view") || p.code.contains("edit");
            } else {
                p.granted = p.code.contains("view");
            }
        }
        permissionAdapter.notifyDataSetChanged();
    }
}
