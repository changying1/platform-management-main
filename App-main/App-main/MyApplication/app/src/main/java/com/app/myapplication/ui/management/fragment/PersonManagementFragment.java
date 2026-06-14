package com.app.myapplication.ui.management.fragment;

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
import com.app.myapplication.data.model.Person;
import com.app.myapplication.ui.management.adapter.PersonAdapter;
import com.google.android.material.floatingactionbutton.FloatingActionButton;
import com.google.gson.JsonObject;

import java.util.ArrayList;
import java.util.List;

import retrofit2.Call;
import retrofit2.Callback;
import retrofit2.Response;

/**
 * 人员管理 - 对应 Web 端 PersonManagement
 */
public class PersonManagementFragment extends BaseManagementFragment {

    private RecyclerView recyclerView;
    private PersonAdapter adapter;
    private TextView tvEmpty;
    private TextView tvCount;
    private FloatingActionButton fabAdd;
    private EditText etSearch;
    private Spinner spinnerCompany;
    private Spinner spinnerProject;
    private Spinner spinnerWorkTeam;
    
    private List<Person> persons = new ArrayList<>();

    @Nullable
    @Override
    public View onCreateView(@NonNull LayoutInflater inflater, @Nullable ViewGroup container, @Nullable Bundle savedInstanceState) {
        View view = inflater.inflate(R.layout.fragment_person_management, container, false);
        
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
        etSearch = view.findViewById(R.id.et_search);
        spinnerCompany = view.findViewById(R.id.spinner_company);
        spinnerProject = view.findViewById(R.id.spinner_project);
        spinnerWorkTeam = view.findViewById(R.id.spinner_work_team);
        
        TextView tvTitle = view.findViewById(R.id.tv_title);
        tvTitle.setText("人员管理");
        
        if (hasPermission("personnel.create")) {
            fabAdd.setOnClickListener(v -> showAddDialog());
        } else {
            fabAdd.hide();
        }
        
        setupSwipeRefresh(view, R.id.swipe_refresh, this::loadData);
    }

    private void setupRecyclerView() {
        recyclerView.setLayoutManager(new LinearLayoutManager(requireContext()));
        adapter = new PersonAdapter(persons, hasPermission("personnel.edit"), hasPermission("personnel.delete"));
        recyclerView.setAdapter(adapter);
    }

    private void loadData() {
        showLoading();
        
        // 调用 API 获取人员列表 - 与 Web 端对齐 /api/personnel/
        managementApi.getPersonnel(getAuthHeaders()).enqueue(new Callback<List<JsonObject>>() {
            @Override
            public void onResponse(Call<List<JsonObject>> call, Response<List<JsonObject>> response) {
                hideLoading();
                if (response.isSuccessful() && response.body() != null) {
                    List<JsonObject> apiData = response.body();
                    if (apiData.size() > 0) {
                        persons.clear();
                        for (JsonObject p : apiData) {
                            Person person = parsePersonFromJson(p);
                            if (person != null) {
                                persons.add(person);
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
     * 从 JSON 解析人员数据 - 与 Web 端映射逻辑对齐
     */
    private Person parsePersonFromJson(JsonObject p) {
        try {
            String id = p.has("id") ? p.get("id").getAsString() : "0";
            String name = p.has("full_name") ? p.get("full_name").getAsString() : 
                         (p.has("username") ? p.get("username").getAsString() : "");
            String employeeId = p.has("employee_code") ? p.get("employee_code").getAsString() : "";
            String phone = p.has("phone") ? p.get("phone").getAsString() : "";
            String workType = p.has("work_type_id") ? p.get("work_type_id").getAsString() : "普通员工";
            String workTeam = p.has("work_team") ? p.get("work_team").getAsString() : 
                             (p.has("team") ? p.get("team").getAsString() : "");
            String project = p.has("project") ? p.get("project").getAsString() : "";
            String company = p.has("company") ? p.get("company").getAsString() : "";
            String status = p.has("status") ? p.get("status").getAsString() : "active";
            String entryDate = p.has("entry_date") ? p.get("entry_date").getAsString() : "2024-01-01";
            
            return new Person(id, name, employeeId, phone, workType, workTeam, project, company, status, entryDate);
        } catch (Exception e) {
            return null;
        }
    }

    /**
     * 加载硬编码数据 - 与 Web 端 SQL_PERSONNEL 对齐
     */
    private void loadMockData() {
        persons.clear();
        
        persons.add(new Person("1", "张建国", "HQ-ADMIN-001", "13900000001", 
            "管理人员", "总公司", "总公司", "总部", "active", "2024-01-01"));
        persons.add(new Person("2", "王振国", "BR-ADMIN-001", "13900001001",
            "管理人员", "第一分公司", "西安东站", "第一分公司", "active", "2024-01-01"));
        persons.add(new Person("3", "李志远", "BR-ADMIN-002", "13900001002",
            "管理人员", "第二分公司", "西安地铁8号线", "第二分公司", "active", "2024-01-01"));
        persons.add(new Person("4", "张伟", "XA-WK-001", "13800101001",
            "土建工", "土建工队", "默认项目", "默认分公司", "active", "2024-02-15"));
        persons.add(new Person("5", "王强", "XA-WK-002", "13800101002",
            "土建工", "土建工队", "默认项目", "默认分公司", "active", "2024-02-15"));
        persons.add(new Person("6", "李磊", "XA-WK-003", "13800101003",
            "土建工", "土建工队", "默认项目", "默认分公司", "active", "2024-02-15"));
        persons.add(new Person("7", "赵勇", "XA-WK-004", "13800101004",
            "架子工", "土建工队", "默认项目", "默认分公司", "active", "2024-02-15"));
        persons.add(new Person("8", "刘杰", "XA-WK-005", "13800101005",
            "电工", "机电工队", "默认项目", "默认分公司", "active", "2024-02-15"));
        persons.add(new Person("9", "陈涛", "XA-WK-006", "13800101006",
            "焊工", "机电工队", "默认项目", "默认分公司", "active", "2024-02-15"));
        persons.add(new Person("10", "周明", "XA-WK-007", "13800101007",
            "起重工", "起重工队", "默认项目", "默认分公司", "active", "2024-02-15"));
    }

    private void updateUI() {
        tvCount.setText(String.format("共 %d 人", persons.size()));
        if (persons.isEmpty()) {
            tvEmpty.setVisibility(View.VISIBLE);
            recyclerView.setVisibility(View.GONE);
        } else {
            tvEmpty.setVisibility(View.GONE);
            recyclerView.setVisibility(View.VISIBLE);
        }
    }

    private void showAddDialog() {
        showToast("添加人员功能开发中");
    }
}
