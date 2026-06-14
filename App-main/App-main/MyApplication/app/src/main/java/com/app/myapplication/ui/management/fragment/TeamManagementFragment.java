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
import com.app.myapplication.data.model.Team;
import com.app.myapplication.ui.management.adapter.TeamAdapter;
import com.google.android.material.floatingactionbutton.FloatingActionButton;
import com.google.gson.JsonObject;

import java.util.ArrayList;
import java.util.List;

import retrofit2.Call;
import retrofit2.Callback;
import retrofit2.Response;

/**
 * 工队管理 - 对应 Web 端 TeamManagement
 */
public class TeamManagementFragment extends BaseManagementFragment {

    private RecyclerView recyclerView;
    private TeamAdapter adapter;
    private TextView tvEmpty;
    private TextView tvCount;
    private FloatingActionButton fabAdd;
    private List<Team> teams = new ArrayList<>();

    @Nullable
    @Override
    public View onCreateView(@NonNull LayoutInflater inflater, @Nullable ViewGroup container, @Nullable Bundle savedInstanceState) {
        View view = inflater.inflate(R.layout.fragment_team_management, container, false);
        
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
        tvTitle.setText("工队管理");
        
        if (hasPermission("personnel.create")) {
            fabAdd.setOnClickListener(v -> showAddDialog());
        } else {
            fabAdd.hide();
        }
        
        setupSwipeRefresh(view, R.id.swipe_refresh, this::loadData);
    }

    private void setupRecyclerView() {
        recyclerView.setLayoutManager(new LinearLayoutManager(requireContext()));
        adapter = new TeamAdapter(teams);
        recyclerView.setAdapter(adapter);
    }

    private void loadData() {
        showLoading();
        
        // 调用 API 获取工队列表 - 与 Web 端对齐 /team/list
        managementApi.getTeams(getAuthHeaders()).enqueue(new Callback<List<JsonObject>>() {
            @Override
            public void onResponse(Call<List<JsonObject>> call, Response<List<JsonObject>> response) {
                hideLoading();
                if (response.isSuccessful() && response.body() != null) {
                    List<JsonObject> apiData = response.body();
                    if (apiData.size() > 0) {
                        teams.clear();
                        for (JsonObject t : apiData) {
                            Team team = parseTeamFromJson(t);
                            if (team != null) {
                                teams.add(team);
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
     * 从 JSON 解析工队数据
     */
    private Team parseTeamFromJson(JsonObject t) {
        try {
            String id = t.has("id") ? t.get("id").getAsString() : "";
            String name = t.has("name") ? t.get("name").getAsString() : 
                         (t.has("team_name") ? t.get("team_name").getAsString() : "");
            String company = t.has("company") ? t.get("company").getAsString() : 
                            (t.has("company_name") ? t.get("company_name").getAsString() : "");
            String project = t.has("project") ? t.get("project").getAsString() : 
                            (t.has("project_name") ? t.get("project_name").getAsString() : "");
            String color = t.has("color") ? t.get("color").getAsString() : "#06b6d4";
            int personnelCount = t.has("personnel_count") ? t.get("personnel_count").getAsInt() : 0;
            
            return new Team(id, name, company, project, color, personnelCount);
        } catch (Exception e) {
            return null;
        }
    }

    /**
     * 加载硬编码数据 - 与 Web 端对齐
     */
    private void loadMockData() {
        teams.clear();
        
        teams.add(new Team("T001", "土建工队", "第一分公司", "西安东站项目", "#06b6d4", 0));
        teams.add(new Team("T002", "机电工队", "第一分公司", "西安东站项目", "#8b5cf6", 0));
        teams.add(new Team("T003", "装修工队", "第二分公司", "北京丰台站改造", "#f59e0b", 0));
        teams.add(new Team("T004", "盾构工队", "第一分公司", "西安地铁8号线", "#10b981", 0));
        teams.add(new Team("T005", "信号工队", "第三分公司", "上海浦东机场联络线", "#ef4444", 0));
    }

    private void updateUI() {
        tvCount.setText(String.format("共 %d 个工队", teams.size()));
        if (teams.isEmpty()) {
            tvEmpty.setVisibility(View.VISIBLE);
            recyclerView.setVisibility(View.GONE);
        } else {
            tvEmpty.setVisibility(View.GONE);
            recyclerView.setVisibility(View.VISIBLE);
        }
    }

    private void showAddDialog() {
        showToast("添加工队功能开发中");
    }
}
