package com.app.myapplication.ui.management.fragment;

import android.os.Bundle;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.EditText;
import android.widget.TextView;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.recyclerview.widget.LinearLayoutManager;
import androidx.recyclerview.widget.RecyclerView;

import com.app.myapplication.R;
import com.app.myapplication.data.model.Permission;
import com.app.myapplication.data.model.PermissionModule;
import com.app.myapplication.data.model.Role;
import com.app.myapplication.data.model.RoleTreeNode;
import com.app.myapplication.ui.management.adapter.PermissionModuleAdapter;
import com.app.myapplication.ui.management.adapter.RoleTreeAdapter;
import com.google.android.material.button.MaterialButton;
import com.google.gson.JsonArray;
import com.google.gson.JsonObject;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import retrofit2.Call;
import retrofit2.Callback;
import retrofit2.Response;

/**
 * 权限管理 - 与 Web 端 PermissionManagement 完全对齐
 * 
 * Web 端实现要点：
 * 1. 从 /api/permissions/accounts 获取账号列表构建角色树
 * 2. 从 /api/permissions/roles 获取角色权限配置
 * 3. 根据 company/project/team 字段动态构建组织架构树
 * 4. 使用 ROLE_RANK 控制权限层级
 */
public class PermissionManagementFragment extends BaseManagementFragment {

    private RecyclerView rvRoleTree;
    private RecyclerView rvPermissions;
    private RoleTreeAdapter roleAdapter;
    private PermissionModuleAdapter permissionAdapter;
    private TextView tvSelectedRole;
    private TextView tvEmptyRole;
    private EditText etRoleSearch;
    private EditText etPermSearch;
    private MaterialButton btnSave;
    private MaterialButton btnReset;
    private View progressBar;
    
    // 数据
    private List<Role> accountRoles = new ArrayList<>();
    private List<RoleTreeNode> roleTree = new ArrayList<>();
    private List<PermissionModule> permissionModules = new ArrayList<>();
    private Role selectedRole = null;
    private List<String> checkedPermissions = new ArrayList<>();
    private Map<String, List<String>> savedPermissions = new HashMap<>();
    private boolean hasChanges = false;
    
    // 当前用户权限级别
    private String currentPermissionLevel;

    @Nullable
    @Override
    public View onCreateView(@NonNull LayoutInflater inflater, @Nullable ViewGroup container, @Nullable Bundle savedInstanceState) {
        View view = inflater.inflate(R.layout.fragment_permission_management, container, false);
        
        // 获取当前用户权限级别
        currentPermissionLevel = sessionManager.getPermissionLevel();
        if (currentPermissionLevel.isEmpty()) {
            currentPermissionLevel = "headquarters_admin";
        }
        
        initViews(view);
        setupRoleTree();
        setupPermissions();
        loadData();
        
        return view;
    }

    private void initViews(View view) {
        rvRoleTree = view.findViewById(R.id.rv_role_tree);
        rvPermissions = view.findViewById(R.id.rv_permissions);
        tvSelectedRole = view.findViewById(R.id.tv_selected_role);
        tvEmptyRole = view.findViewById(R.id.tv_empty_role);
        etRoleSearch = view.findViewById(R.id.et_role_search);
        etPermSearch = view.findViewById(R.id.et_perm_search);
        btnSave = view.findViewById(R.id.btn_save);
        btnReset = view.findViewById(R.id.btn_reset);
        progressBar = view.findViewById(R.id.progress_bar);
        
        TextView tvTitle = view.findViewById(R.id.tv_title);
        tvTitle.setText("权限管理");
        
        // 保存按钮
        btnSave.setOnClickListener(v -> handleSave());
        
        // 重置按钮
        btnReset.setOnClickListener(v -> handleReset());
        
        // 搜索监听
        etRoleSearch.addTextChangedListener(new android.text.TextWatcher() {
            @Override public void beforeTextChanged(CharSequence s, int start, int count, int after) {}
            @Override public void onTextChanged(CharSequence s, int start, int before, int count) {
                filterRoleTree(s.toString());
            }
            @Override public void afterTextChanged(android.text.Editable s) {}
        });
        
        etPermSearch.addTextChangedListener(new android.text.TextWatcher() {
            @Override public void beforeTextChanged(CharSequence s, int start, int count, int after) {}
            @Override public void onTextChanged(CharSequence s, int start, int before, int count) {
                filterPermissions(s.toString());
            }
            @Override public void afterTextChanged(android.text.Editable s) {}
        });
        
        setupSwipeRefresh(view, R.id.swipe_refresh, this::loadData);
    }

    private void setupRoleTree() {
        rvRoleTree.setLayoutManager(new LinearLayoutManager(requireContext()));
        roleAdapter = new RoleTreeAdapter(roleTree, node -> {
            if (node.getType() == RoleTreeNode.NodeType.ROLE && node.getRoleId() != null) {
                handleSelectRole(node.getRoleId());
            }
        });
        rvRoleTree.setAdapter(roleAdapter);
    }

    private void setupPermissions() {
        rvPermissions.setLayoutManager(new LinearLayoutManager(requireContext()));
        permissionAdapter = new PermissionModuleAdapter(permissionModules, (permissionCode, checked) -> {
            handleCheck(permissionCode, checked);
        });
        rvPermissions.setAdapter(permissionAdapter);
    }

    private void loadData() {
        showLoading();
        
        // 1. 加载账号列表 - 与 Web 端对齐 /api/permissions/accounts
        loadPermissionAccounts();
        
        // 2. 加载角色权限配置 - 与 Web 端对齐 /api/permissions/roles
        loadRolePermissions();
        
        // 3. 初始化权限模块（硬编码，与 Web 端 permissionTree 对齐）
        initPermissionModules();
    }

    /**
     * 加载账号列表 - 与 Web 端 loadPermissionAccounts 对齐
     */
    private void loadPermissionAccounts() {
        managementApi.getAccounts(getAuthHeaders()).enqueue(new Callback<List<JsonObject>>() {
            @Override
            public void onResponse(Call<List<JsonObject>> call, Response<List<JsonObject>> response) {
                if (response.isSuccessful() && response.body() != null && !response.body().isEmpty()) {
                    List<JsonObject> apiData = response.body();
                    accountRoles.clear();
                    
                    for (JsonObject item : apiData) {
                        Role role = parseAccountRoleFromJson(item);
                        if (role != null && canUseRole(role)) {
                            accountRoles.add(role);
                        }
                    }
                    
                    if (accountRoles.isEmpty()) {
                        loadMockAccountRoles();
                    } else {
                        // 构建角色树 - 与 Web 端 buildRoleTreeFromAccounts 对齐
                        roleTree.clear();
                        roleTree.addAll(RoleTreeNode.buildRoleTreeFromAccounts(accountRoles));
                    }
                } else {
                    loadMockAccountRoles();
                }
                roleAdapter.updateData(roleTree);
                hideLoading();
            }

            @Override
            public void onFailure(Call<List<JsonObject>> call, Throwable t) {
                loadMockAccountRoles();
                roleAdapter.updateData(roleTree);
                hideLoading();
            }
        });
    }

    /**
     * 从 JSON 解析账号角色 - 与 Web 端映射逻辑对齐
     */
    private Role parseAccountRoleFromJson(JsonObject item) {
        try {
            String id = item.has("id") ? item.get("id").getAsString() : "";
            String name = item.has("name") ? item.get("name").getAsString() : 
                         (item.has("username") ? item.get("username").getAsString() : "未命名账号");
            String code = item.has("username") ? item.get("username").getAsString() : String.valueOf(id);
            String level = item.has("level") ? item.get("level").getAsString() : "";
            String company = item.has("company") ? item.get("company").getAsString() : "";
            String project = item.has("project") ? item.get("project").getAsString() : "";
            String team = item.has("team") ? item.get("team").getAsString() : "";
            String description = item.has("description") ? item.get("description").getAsString() : 
                                Role.getLevelLabel(level);
            
            // 检查 level 是否有效
            if (!isValidLevel(level)) {
                return null;
            }
            
            return new Role(id, name, code, level, company, project, team, description);
        } catch (Exception e) {
            return null;
        }
    }

    /**
     * 检查角色级别是否有效 - 与 Web 端 ROLE_RANK 对齐
     */
    private boolean isValidLevel(String level) {
        if (level == null) return false;
        String lower = level.trim().toLowerCase();
        return "headquarters_admin".equals(lower) ||
               "branch_admin".equals(lower) ||
               "project_safety_admin".equals(lower) ||
               "grid_admin".equals(lower) ||
               "team_admin".equals(lower) ||
               "admin".equals(lower) ||
               "hq".equals(lower);
    }

    /**
     * 检查当前用户是否可以管理该角色 - 与 Web 端 canUseRole 对齐
     */
    private boolean canUseRole(Role role) {
        int currentRank = Role.getRoleRank(currentPermissionLevel);
        int roleRank = Role.getRoleRank(role.getLevel());
        return currentRank >= roleRank;
    }

    /**
     * 加载角色权限配置 - 与 Web 端 loadRolePermissions 对齐
     */
    private void loadRolePermissions() {
        managementApi.getRoles(getAuthHeaders()).enqueue(new Callback<List<JsonObject>>() {
            @Override
            public void onResponse(Call<List<JsonObject>> call, Response<List<JsonObject>> response) {
                if (response.isSuccessful() && response.body() != null) {
                    List<JsonObject> data = response.body();
                    savedPermissions.clear();
                    
                    for (JsonObject item : data) {
                        if (item.has("level") && item.has("permissions")) {
                            String level = item.get("level").getAsString();
                            JsonArray permsArray = item.getAsJsonArray("permissions");
                            List<String> perms = new ArrayList<>();
                            for (int i = 0; i < permsArray.size(); i++) {
                                perms.add(permsArray.get(i).getAsString());
                            }
                            savedPermissions.put(level, perms);
                        }
                    }
                }
            }

            @Override
            public void onFailure(Call<List<JsonObject>> call, Throwable t) {
                // 使用默认权限
            }
        });
    }

    /**
     * 初始化权限模块 - 与 Web 端 permissionTree 硬编码对齐
     */
    private void initPermissionModules() {
        permissionModules.clear();
        
        // dashboard
        permissionModules.add(new PermissionModule("dashboard", "仪表板", "cyan", 
            Arrays.asList(new Permission("dashboard.view", "查看仪表板"))));
        
        // monitor
        permissionModules.add(new PermissionModule("monitor", "视频监控", "purple",
            Arrays.asList(
                new Permission("monitor.playback", "监控回放"),
                new Permission("monitor.track", "轨迹回放"),
                new Permission("monitor.voice", "语音回放"),
                new Permission("monitor.camera", "摄像头管理")
            )));
        
        // fence
        permissionModules.add(new PermissionModule("fence", "电子围栏", "blue",
            Arrays.asList(
                new Permission("fence.view", "查看围栏"),
                new Permission("fence.create", "创建围栏"),
                new Permission("fence.edit", "编辑围栏"),
                new Permission("fence.delete", "删除围栏")
            )));
        
        // device
        permissionModules.add(new PermissionModule("device", "设备管理", "green",
            Arrays.asList(
                new Permission("device.view", "查看设备"),
                new Permission("device.create", "添加设备"),
                new Permission("device.edit", "编辑设备"),
                new Permission("device.delete", "删除设备")
            )));
        
        // personnel
        permissionModules.add(new PermissionModule("personnel", "人员管理", "orange",
            Arrays.asList(
                new Permission("personnel.view", "查看人员"),
                new Permission("personnel.create", "添加人员"),
                new Permission("personnel.edit", "编辑人员"),
                new Permission("personnel.delete", "删除人员")
            )));
        
        // alarm
        permissionModules.add(new PermissionModule("alarm", "告警管理", "red",
            Arrays.asList(
                new Permission("alarm.view", "查看告警"),
                new Permission("alarm.handle", "处理告警")
            )));
        
        // system
        permissionModules.add(new PermissionModule("system", "系统管理", "gray",
            Arrays.asList(
                new Permission("system.role", "权限管理"),
                new Permission("system.log", "操作日志")
            )));
        
        permissionAdapter.notifyDataSetChanged();
    }

    /**
     * 选择角色 - 与 Web 端 handleSelectRole 对齐
     */
    private void handleSelectRole(String roleId) {
        selectedRole = null;
        for (Role role : accountRoles) {
            if (role.getId().equals(roleId)) {
                selectedRole = role;
                break;
            }
        }
        
        if (selectedRole != null) {
            tvSelectedRole.setText("当前角色: " + selectedRole.getDisplayName() + " (只读)");
            tvEmptyRole.setVisibility(View.GONE);
            rvPermissions.setVisibility(View.VISIBLE);
            
            // 加载该角色的权限
            List<String> perms = savedPermissions.get(selectedRole.getLevel());
            if (perms == null) {
                perms = getDefaultPermissions(selectedRole.getLevel());
            }
            checkedPermissions = new ArrayList<>(perms);
            
            // 更新权限列表的选中状态
            for (PermissionModule module : permissionModules) {
                for (Permission permission : module.getPermissions()) {
                    permission.setChecked(checkedPermissions.contains(permission.getCode()));
                }
            }
            
            hasChanges = false;
            updateSaveButton();
            permissionAdapter.notifyDataSetChanged();
        }
    }

    /**
     * 处理权限勾选 - 与 Web 端 handleCheck 对齐
     */
    private void handleCheck(String code, boolean checked) {
        if (checked) {
            if (!checkedPermissions.contains(code)) {
                checkedPermissions.add(code);
            }
        } else {
            checkedPermissions.remove(code);
        }
        hasChanges = true;
        updateSaveButton();
    }

    /**
     * 保存权限 - 与 Web 端 handleSave 对齐
     */
    private void handleSave() {
        if (selectedRole == null) return;
        
        btnSave.setEnabled(false);
        progressBar.setVisibility(View.VISIBLE);
        
        JsonObject body = new JsonObject();
        JsonArray permsArray = new JsonArray();
        for (String p : checkedPermissions) {
            permsArray.add(p);
        }
        body.add("permissions", permsArray);
        
        managementApi.updateRolePermissions(getAuthHeaders(), selectedRole.getLevel(), body)
            .enqueue(new Callback<Void>() {
                @Override
                public void onResponse(Call<Void> call, Response<Void> response) {
                    btnSave.setEnabled(true);
                    progressBar.setVisibility(View.GONE);
                    
                    if (response.isSuccessful()) {
                        savedPermissions.put(selectedRole.getLevel(), new ArrayList<>(checkedPermissions));
                        hasChanges = false;
                        updateSaveButton();
                        showToast("「" + selectedRole.getName() + "」权限配置已保存");
                    } else {
                        showToast("保存失败: " + response.code());
                    }
                }

                @Override
                public void onFailure(Call<Void> call, Throwable t) {
                    btnSave.setEnabled(true);
                    progressBar.setVisibility(View.GONE);
                    showToast("网络错误，保存失败");
                }
            });
    }

    /**
     * 重置权限 - 与 Web 端 handleReset 对齐
     */
    private void handleReset() {
        if (selectedRole != null) {
            List<String> defaultPerms = getDefaultPermissions(selectedRole.getLevel());
            checkedPermissions = new ArrayList<>(defaultPerms);
            
            for (PermissionModule module : permissionModules) {
                for (Permission permission : module.getPermissions()) {
                    permission.setChecked(checkedPermissions.contains(permission.getCode()));
                }
            }
            
            hasChanges = false;
            updateSaveButton();
            permissionAdapter.notifyDataSetChanged();
        }
    }

    /**
     * 获取默认权限 - 与 Web 端 defaultPermissions 对齐
     */
    private List<String> getDefaultPermissions(String level) {
        // 所有角色默认拥有全部权限
        List<String> allPerms = Arrays.asList(
            "dashboard.view",
            "monitor.playback", "monitor.track", "monitor.voice", "monitor.camera",
            "fence.view", "fence.create", "fence.edit", "fence.delete",
            "device.view", "device.create", "device.edit", "device.delete",
            "personnel.view", "personnel.create", "personnel.edit", "personnel.delete",
            "alarm.view", "alarm.handle",
            "system.role", "system.log"
        );
        return new ArrayList<>(allPerms);
    }

    /**
     * 筛选角色树 - 与 Web 端 filterRoleTree 对齐
     */
    private void filterRoleTree(String keyword) {
        if (keyword.isEmpty()) {
            roleTree.clear();
            roleTree.addAll(RoleTreeNode.buildRoleTreeFromAccounts(accountRoles));
        } else {
            // 简化实现：重新构建后过滤
            List<RoleTreeNode> filtered = filterNodes(RoleTreeNode.buildRoleTreeFromAccounts(accountRoles), keyword);
            roleTree.clear();
            roleTree.addAll(filtered);
        }
        roleAdapter.updateData(roleTree);
    }

    private List<RoleTreeNode> filterNodes(List<RoleTreeNode> nodes, String keyword) {
        List<RoleTreeNode> result = new ArrayList<>();
        for (RoleTreeNode node : nodes) {
            if (node.getName().contains(keyword)) {
                result.add(node);
            } else if (node.hasChildren()) {
                List<RoleTreeNode> filtered = filterNodes(node.getChildren(), keyword);
                if (!filtered.isEmpty()) {
                    RoleTreeNode copy = new RoleTreeNode(node.getId(), node.getName(), node.getType());
                    copy.getChildren().addAll(filtered);
                    result.add(copy);
                }
            }
        }
        return result;
    }

    /**
     * 筛选权限 - 与 Web 端 filteredPermissions 对齐
     */
    private void filterPermissions(String keyword) {
        // 重新初始化所有权限模块
        initPermissionModules();
        
        if (!keyword.isEmpty()) {
            List<PermissionModule> filtered = new ArrayList<>();
            for (PermissionModule module : permissionModules) {
                if (module.getName().contains(keyword)) {
                    filtered.add(module);
                } else {
                    List<Permission> filteredPerms = new ArrayList<>();
                    for (Permission p : module.getPermissions()) {
                        if (p.getName().contains(keyword)) {
                            filteredPerms.add(p);
                        }
                    }
                    if (!filteredPerms.isEmpty()) {
                        PermissionModule copy = new PermissionModule(
                            module.getId(), module.getName(), module.getColor(), filteredPerms);
                        filtered.add(copy);
                    }
                }
            }
            permissionModules.clear();
            permissionModules.addAll(filtered);
        }
        
        // 恢复选中状态
        for (PermissionModule module : permissionModules) {
            for (Permission permission : module.getPermissions()) {
                permission.setChecked(checkedPermissions.contains(permission.getCode()));
            }
        }
        
        permissionAdapter.notifyDataSetChanged();
    }

    private void updateSaveButton() {
        btnSave.setEnabled(selectedRole != null);
        btnReset.setVisibility(hasChanges ? View.VISIBLE : View.GONE);
    }

    /**
     * 加载模拟账号角色数据 - 与 Web 端数据结构对齐
     */
    private void loadMockAccountRoles() {
        accountRoles.clear();
        
        accountRoles.add(new Role("1", "张建国", "zhangjg", "headquarters_admin", 
            "", "", "", "总部管理员"));
        accountRoles.add(new Role("2", "王振国", "wangzg", "branch_admin", 
            "第一分公司", "", "", "分公司管理员"));
        accountRoles.add(new Role("3", "李志远", "lizy", "branch_admin", 
            "第二分公司", "", "", "分公司管理员"));
        accountRoles.add(new Role("4", "项目管理员1", "pm1", "project_safety_admin", 
            "第一分公司", "西安东站项目", "", "项目管理员"));
        accountRoles.add(new Role("5", "网格管理员1", "gm1", "grid_admin", 
            "第一分公司", "西安东站项目", "A区施工网格", "网格管理员"));
        accountRoles.add(new Role("6", "工队管理员1", "tm1", "team_admin", 
            "第一分公司", "西安东站项目", "土建工队", "工队管理员"));
        
        roleTree.clear();
        roleTree.addAll(RoleTreeNode.buildRoleTreeFromAccounts(accountRoles));
    }
}
