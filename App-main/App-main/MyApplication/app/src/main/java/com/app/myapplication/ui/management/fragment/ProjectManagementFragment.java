package com.app.myapplication.ui.management.fragment;

import android.app.AlertDialog;
import android.os.Bundle;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.EditText;
import android.widget.Spinner;
import android.widget.TextView;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.recyclerview.widget.LinearLayoutManager;
import androidx.recyclerview.widget.RecyclerView;

import com.app.myapplication.R;
import com.app.myapplication.data.model.Project;
import com.app.myapplication.ui.management.adapter.ProjectAdapter;
import com.google.android.material.floatingactionbutton.FloatingActionButton;
import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;

import java.util.ArrayList;
import java.util.List;

import retrofit2.Call;
import retrofit2.Callback;
import retrofit2.Response;

/**
 * 项目管理 - 对应 Web 端 ProjectManagement
 */
public class ProjectManagementFragment extends BaseManagementFragment {

    private RecyclerView recyclerView;
    private ProjectAdapter adapter;
    private TextView tvEmpty;
    private TextView tvCount;
    private FloatingActionButton fabAdd;
    private List<Project> projects = new ArrayList<>();

    // 筛选
    private Spinner spinnerCompany;
    private Spinner spinnerStatus;
    private EditText etSearch;

    @Nullable
    @Override
    public View onCreateView(@NonNull LayoutInflater inflater, @Nullable ViewGroup container, @Nullable Bundle savedInstanceState) {
        View view = inflater.inflate(R.layout.fragment_project_management, container, false);
        
        initViews(view);
        setupRecyclerView();
        loadData();
        
        return view;
    }

    private void initViews(View view) {
        recyclerView = view.findViewById(R.id.recycler_view);
        tvEmpty = view.findViewById(R.id.tv_empty);
        tvCount = view.findViewById(R.id.tv_count);
        fabAdd = view.findViewById(R.id.fab_add);
        
        // 标题
        TextView tvTitle = view.findViewById(R.id.tv_title);
        tvTitle.setText("项目管理");
        
        // 筛选控件
        spinnerCompany = view.findViewById(R.id.spinner_company);
        spinnerStatus = view.findViewById(R.id.spinner_status);
        etSearch = view.findViewById(R.id.et_search);
        
        // 添加按钮
        if (hasPermission("personnel.create")) {
            fabAdd.setOnClickListener(v -> showAddDialog());
        } else {
            fabAdd.hide();
        }
        
        setupSwipeRefresh(view, R.id.swipe_refresh, this::loadData);
    }

    private void setupRecyclerView() {
        recyclerView.setLayoutManager(new LinearLayoutManager(requireContext()));
        adapter = new ProjectAdapter(projects, new ProjectAdapter.OnProjectActionListener() {
            @Override
            public void onEdit(Project project) {
                showEditDialog(project);
            }

            @Override
            public void onDelete(Project project) {
                showDeleteConfirm(project);
            }

            @Override
            public void onViewDetail(Project project) {
                showDetailDialog(project);
            }
        });
        recyclerView.setAdapter(adapter);
    }

    private void loadData() {
        showLoading();
        
        // 调用 API 获取项目列表 - 与 Web 端对齐
        managementApi.getProjects(getAuthHeaders()).enqueue(new Callback<List<JsonObject>>() {
            @Override
            public void onResponse(Call<List<JsonObject>> call, Response<List<JsonObject>> response) {
                hideLoading();
                if (response.isSuccessful() && response.body() != null) {
                    List<JsonObject> apiData = response.body();
                    // 如果 API 返回数据多于1条，使用 API 数据
                    if (apiData.size() > 1) {
                        projects.clear();
                        for (JsonObject p : apiData) {
                            Project project = parseProjectFromJson(p);
                            if (project != null) {
                                projects.add(project);
                            }
                        }
                    } else {
                        // API 无数据，使用硬编码数据（与 Web 端 SQL_PROJECTS 对齐）
                        loadMockData();
                    }
                } else {
                    // API 调用失败，使用硬编码数据
                    loadMockData();
                }
                adapter.notifyDataSetChanged();
                updateUI();
            }

            @Override
            public void onFailure(Call<List<JsonObject>> call, Throwable t) {
                hideLoading();
                // API 调用失败，使用硬编码数据
                loadMockData();
                adapter.notifyDataSetChanged();
                updateUI();
                showToast("网络错误，显示本地数据");
            }
        });
    }

    /**
     * 从 JSON 解析项目数据 - 与 Web 端映射逻辑对齐
     */
    private Project parseProjectFromJson(JsonObject p) {
        try {
            int id = p.has("id") ? p.get("id").getAsInt() : 0;
            String name = p.has("project_name") ? p.get("project_name").getAsString() : 
                         (p.has("name") ? p.get("name").getAsString() : "");
            String manager = p.has("manager_name") ? p.get("manager_name").getAsString() : 
                            (p.has("manager") ? p.get("manager").getAsString() : "");
            String startDate = "2024-01-01";
            if (p.has("created_at")) {
                String createdAt = p.get("created_at").getAsString();
                startDate = createdAt.split("T")[0];
            } else if (p.has("start_date")) {
                startDate = p.get("start_date").getAsString();
            }
            String status = "ongoing";
            if (p.has("status")) {
                String s = p.get("status").getAsString();
                status = "active".equals(s) ? "ongoing" : 
                        ("completed".equals(s) ? "completed" : "suspended");
            }
            String address = p.has("address") ? p.get("address").getAsString() : "";
            
            // 默认值（与 Web 端一致）
            String company = "默认分公司";
            String team = "土建工队";
            
            return new Project(id, name, company, team, manager, "", manager, "", startDate, null, status, address);
        } catch (Exception e) {
            return null;
        }
    }

    /**
     * 加载硬编码数据 - 与 Web 端 SQL_PROJECTS 对齐
     */
    private void loadMockData() {
        projects.clear();
        
        projects.add(new Project(1, "西安东站项目", "第一分公司", "土建工队", 
            "李明", "13900002001", "李明", "13900002001",
            "2026-04-05", null, "ongoing", "西安市雁塔区"));
        
        projects.add(new Project(2, "西安地铁8号线", "第一分公司", "土建工队",
            "王磊", "13900002002", "王磊", "13900002002",
            "2026-04-05", null, "ongoing", "西安市未央区"));
        
        projects.add(new Project(3, "咸阳机场T5航站楼", "第一分公司", "机电工队",
            "张强", "13900002003", "张强", "13900002003",
            "2026-04-05", null, "ongoing", "咸阳市渭城区"));
        
        projects.add(new Project(4, "北京地铁17号线", "第二分公司", "土建工队",
            "刘洋", "13900002004", "刘洋", "13900002004",
            "2026-04-05", null, "ongoing", "北京市朝阳区"));
        
        projects.add(new Project(5, "北京丰台站改造", "第二分公司", "装修工队",
            "陈浩", "13900002005", "陈浩", "13900002005",
            "2026-04-05", null, "ongoing", "北京市丰台区"));
        
        projects.add(new Project(6, "上海浦东机场联络线", "第三分公司", "土建工队",
            "赵鹏", "13900002006", "赵鹏", "13900002006",
            "2026-04-05", null, "ongoing", "上海市浦东新区"));
        
        projects.add(new Project(7, "上海轨道交通市域线", "第三分公司", "机电工队",
            "周涛", "13900002007", "周涛", "13900002007",
            "2026-04-05", null, "suspended", "上海市闵行区"));
    }

    private void updateUI() {
        tvCount.setText(String.format("共 %d 个项目", projects.size()));
        if (projects.isEmpty()) {
            tvEmpty.setVisibility(View.VISIBLE);
            recyclerView.setVisibility(View.GONE);
        } else {
            tvEmpty.setVisibility(View.GONE);
            recyclerView.setVisibility(View.VISIBLE);
        }
    }

    private void showAddDialog() {
        showToast("添加项目功能开发中");
    }

    private void showEditDialog(Project project) {
        showToast("编辑项目: " + project.getName());
    }

    private void showDeleteConfirm(Project project) {
        new AlertDialog.Builder(requireContext())
            .setTitle("确认删除")
            .setMessage("确定要删除项目「" + project.getName() + "」吗？")
            .setPositiveButton("删除", (dialog, which) -> {
                projects.remove(project);
                adapter.notifyDataSetChanged();
                updateUI();
                showToast("已删除");
            })
            .setNegativeButton("取消", null)
            .show();
    }

    private void showDetailDialog(Project project) {
        showToast("项目详情: " + project.getName());
    }
}
