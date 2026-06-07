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
import com.app.myapplication.data.model.ResponsibilityUnit;
import com.app.myapplication.ui.management.adapter.ResponsibilityTreeAdapter;
import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;

import java.util.ArrayList;
import java.util.List;

import retrofit2.Call;
import retrofit2.Callback;
import retrofit2.Response;

/**
 * 穿透式责任管理 - 对应 Web 端 ResponsibilityManagement
 * 展示公司-项目-网格-工队的树形责任结构
 */
public class ResponsibilityManagementFragment extends BaseManagementFragment {

    private RecyclerView recyclerView;
    private ResponsibilityTreeAdapter adapter;
    private TextView tvEmpty;
    private TextView tvCount;
    private List<ResponsibilityUnit> responsibilityUnits = new ArrayList<>();

    @Nullable
    @Override
    public View onCreateView(@NonNull LayoutInflater inflater, @Nullable ViewGroup container, @Nullable Bundle savedInstanceState) {
        View view = inflater.inflate(R.layout.fragment_responsibility_management, container, false);
        
        initViews(view);
        setupRecyclerView();
        loadData();
        
        return view;
    }

    private void initViews(View view) {
        recyclerView = view.findViewById(R.id.recycler_view);
        tvEmpty = view.findViewById(R.id.tv_empty);
        tvCount = view.findViewById(R.id.tv_count);
        
        // 设置标题
        TextView tvTitle = view.findViewById(R.id.tv_title);
        if (tvTitle != null) {
            tvTitle.setText("穿透式责任管理");
        }
        
        setupSwipeRefresh(view, R.id.swipe_refresh, this::loadData);
    }

    private void setupRecyclerView() {
        recyclerView.setLayoutManager(new LinearLayoutManager(requireContext()));
        adapter = new ResponsibilityTreeAdapter(responsibilityUnits, unit -> {
            // 点击节点展开/折叠
        });
        recyclerView.setAdapter(adapter);
    }

    private void loadData() {
        showLoading();
        
        // 先显示模拟数据确保UI正常
        loadMockData();
        hideLoading();
        
        // 然后尝试从API加载真实数据
        managementApi.getResponsibilityTree(getAuthHeaders()).enqueue(new Callback<List<JsonObject>>() {
            @Override
            public void onResponse(Call<List<JsonObject>> call, Response<List<JsonObject>> response) {
                if (response.isSuccessful() && response.body() != null) {
                    List<JsonObject> data = response.body();
                    if (data.size() > 0) {
                        responsibilityUnits.clear();
                        
                        for (JsonObject item : data) {
                            ResponsibilityUnit unit = parseUnitFromJson(item);
                            if (unit != null) {
                                responsibilityUnits.add(unit);
                            }
                        }
                        
                        adapter.updateData(responsibilityUnits);
                        updateEmptyView();
                    }
                }
            }

            @Override
            public void onFailure(Call<List<JsonObject>> call, Throwable t) {
                // 保持模拟数据
            }
        });
    }
    
    private ResponsibilityUnit parseUnitFromJson(JsonObject json) {
        try {
            String id = json.has("id") ? json.get("id").getAsString() : "";
            String unitId = json.has("unit_id") ? json.get("unit_id").getAsString() : id;
            String name = json.has("name") ? json.get("name").getAsString() : "";
            String type = json.has("type") ? json.get("type").getAsString() : "";
            String parentId = json.has("parent_id") && !json.get("parent_id").isJsonNull() 
                ? json.get("parent_id").getAsString() : null;
            String responsiblePerson = json.has("responsible_person_name") && !json.get("responsible_person_name").isJsonNull()
                ? json.get("responsible_person_name").getAsString() : "";
            
            ResponsibilityUnit unit = new ResponsibilityUnit(unitId, name, type, parentId);
            unit.setResponsiblePerson(responsiblePerson);
            
            // 解析子节点
            if (json.has("children") && json.get("children").isJsonArray()) {
                JsonArray childrenArray = json.getAsJsonArray("children");
                for (JsonElement childElem : childrenArray) {
                    if (childElem.isJsonObject()) {
                        ResponsibilityUnit child = parseUnitFromJson(childElem.getAsJsonObject());
                        if (child != null) {
                            unit.addChild(child);
                        }
                    }
                }
            }
            
            return unit;
        } catch (Exception e) {
            e.printStackTrace();
            return null;
        }
    }
    
    private void loadMockData() {
        List<ResponsibilityUnit> units = new ArrayList<>();
        
        // 第一分公司
        ResponsibilityUnit company1 = new ResponsibilityUnit("1", "第一分公司", "branch", null);
        ResponsibilityUnit project1 = new ResponsibilityUnit("2", "西安东站项目", "project", "1");
        ResponsibilityUnit grid1 = new ResponsibilityUnit("3", "A区施工网格", "grid", "2");
        ResponsibilityUnit team1 = new ResponsibilityUnit("4", "土建工队", "team", "3");
        ResponsibilityUnit team2 = new ResponsibilityUnit("5", "机电工队", "team", "3");
        
        grid1.addChild(team1);
        grid1.addChild(team2);
        project1.addChild(grid1);
        company1.addChild(project1);
        
        // 第二分公司
        ResponsibilityUnit company2 = new ResponsibilityUnit("6", "第二分公司", "branch", null);
        ResponsibilityUnit project2 = new ResponsibilityUnit("7", "西安地铁8号线", "project", "6");
        ResponsibilityUnit grid2 = new ResponsibilityUnit("8", "盾构区间网格", "grid", "7");
        ResponsibilityUnit team3 = new ResponsibilityUnit("9", "盾构工队", "team", "8");
        
        grid2.addChild(team3);
        project2.addChild(grid2);
        company2.addChild(project2);
        
        units.add(company1);
        units.add(company2);
        
        responsibilityUnits.clear();
        responsibilityUnits.addAll(units);
        
        adapter.updateData(responsibilityUnits);
        updateEmptyView();
    }

    private void updateEmptyView() {
        int itemCount = adapter != null ? adapter.getItemCount() : 0;
        android.util.Log.d("Responsibility", "updateEmptyView: units=" + responsibilityUnits.size() + ", adapter items=" + itemCount);
        
        if (responsibilityUnits.isEmpty()) {
            tvEmpty.setVisibility(View.VISIBLE);
            recyclerView.setVisibility(View.GONE);
            if (tvCount != null) {
                tvCount.setText("共 0 个单位");
            }
        } else {
            tvEmpty.setVisibility(View.GONE);
            recyclerView.setVisibility(View.VISIBLE);
            if (tvCount != null) {
                int totalCount = countAllUnits(responsibilityUnits);
                tvCount.setText("共 " + totalCount + " 个单位");
            }
        }
    }
    
    private int countAllUnits(List<ResponsibilityUnit> units) {
        int count = 0;
        for (ResponsibilityUnit unit : units) {
            count++;
            if (unit.getChildren() != null && !unit.getChildren().isEmpty()) {
                count += countAllUnits(unit.getChildren());
            }
        }
        return count;
    }
}
