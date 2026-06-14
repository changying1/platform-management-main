package com.app.myapplication.ui.management.fragment;

import android.os.Bundle;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.TextView;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.recyclerview.widget.LinearLayoutManager;
import androidx.recyclerview.widget.RecyclerView;

import com.app.myapplication.R;
import com.app.myapplication.data.model.Grid;
import com.app.myapplication.ui.management.adapter.GridAdapter;
import com.google.android.material.floatingactionbutton.FloatingActionButton;
import com.google.gson.JsonObject;

import java.util.ArrayList;
import java.util.List;

import retrofit2.Call;
import retrofit2.Callback;
import retrofit2.Response;

/**
 * 网格管理 - 对应 Web 端 GridManagement
 */
public class GridManagementFragment extends BaseManagementFragment {

    private RecyclerView recyclerView;
    private GridAdapter adapter;
    private TextView tvEmpty;
    private TextView tvCount;
    private FloatingActionButton fabAdd;
    private List<Grid> grids = new ArrayList<>();

    @Nullable
    @Override
    public View onCreateView(@NonNull LayoutInflater inflater, @Nullable ViewGroup container, @Nullable Bundle savedInstanceState) {
        View view = inflater.inflate(R.layout.fragment_grid_management, container, false);
        
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
        
        TextView tvTitle = view.findViewById(R.id.tv_title);
        tvTitle.setText("网格管理");
        
        if (hasPermission("personnel.create")) {
            fabAdd.setOnClickListener(v -> showAddDialog());
        } else {
            fabAdd.hide();
        }
        
        setupSwipeRefresh(view, R.id.swipe_refresh, this::loadData);
    }

    private void setupRecyclerView() {
        recyclerView.setLayoutManager(new LinearLayoutManager(requireContext()));
        adapter = new GridAdapter(grids);
        recyclerView.setAdapter(adapter);
    }

    private void loadData() {
        showLoading();
        
        // 调用 API 获取网格列表 - 与 Web 端对齐 /api/grids/
        managementApi.getGrids(getAuthHeaders()).enqueue(new Callback<List<JsonObject>>() {
            @Override
            public void onResponse(Call<List<JsonObject>> call, Response<List<JsonObject>> response) {
                hideLoading();
                if (response.isSuccessful() && response.body() != null) {
                    List<JsonObject> apiData = response.body();
                    if (apiData.size() > 0) {
                        grids.clear();
                        for (JsonObject g : apiData) {
                            Grid grid = parseGridFromJson(g);
                            if (grid != null) {
                                grids.add(grid);
                            }
                        }
                    } else {
                        loadMockData();
                    }
                } else {
                    loadMockData();
                }
                adapter.notifyDataSetChanged();
                updateUI();
            }

            @Override
            public void onFailure(Call<List<JsonObject>> call, Throwable t) {
                hideLoading();
                loadMockData();
                adapter.notifyDataSetChanged();
                updateUI();
                showToast("网络错误，显示本地数据");
            }
        });
    }

    /**
     * 从 JSON 解析网格数据
     */
    private Grid parseGridFromJson(JsonObject g) {
        try {
            String id = g.has("id") ? g.get("id").getAsString() : "";
            String name = g.has("name") ? g.get("name").getAsString() : 
                         (g.has("grid_name") ? g.get("grid_name").getAsString() : "");
            String project = g.has("project") ? g.get("project").getAsString() : 
                            (g.has("project_name") ? g.get("project_name").getAsString() : "");
            String company = g.has("company") ? g.get("company").getAsString() : 
                            (g.has("company_name") ? g.get("company_name").getAsString() : "");
            String manager = g.has("manager") ? g.get("manager").getAsString() : 
                            (g.has("manager_name") ? g.get("manager_name").getAsString() : "");
            String status = g.has("status") ? g.get("status").getAsString() : "active";
            int personnelCount = g.has("personnel_count") ? g.get("personnel_count").getAsInt() : 0;
            int teamCount = g.has("team_count") ? g.get("team_count").getAsInt() : 0;
            
            return new Grid(id, name, project, company, manager, status, personnelCount, teamCount);
        } catch (Exception e) {
            return null;
        }
    }

    /**
     * 加载硬编码数据
     */
    private void loadMockData() {
        grids.clear();
        
        grids.add(new Grid("1", "A区施工网格", "西安东站项目", "第一分公司", 
            "grid_admin_1", "active", 15, 8));
        grids.add(new Grid("2", "B区施工网格", "西安东站项目", "第一分公司",
            "grid_admin_2", "active", 12, 6));
        grids.add(new Grid("3", "盾构区间网格", "西安地铁8号线", "第一分公司",
            "grid_admin_3", "active", 20, 10));
        grids.add(new Grid("4", "航站楼主体网格", "咸阳机场T5航站楼", "第一分公司",
            "grid_admin_4", "active", 25, 12));
    }

    private void updateUI() {
        tvCount.setText(String.format("共 %d 个网格", grids.size()));
        if (grids.isEmpty()) {
            tvEmpty.setVisibility(View.VISIBLE);
            recyclerView.setVisibility(View.GONE);
        } else {
            tvEmpty.setVisibility(View.GONE);
            recyclerView.setVisibility(View.VISIBLE);
        }
    }

    private void showAddDialog() {
        showToast("添加网格功能开发中");
    }
}
