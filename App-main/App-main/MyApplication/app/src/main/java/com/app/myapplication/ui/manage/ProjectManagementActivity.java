package com.app.myapplication.ui.manage;

import android.os.Bundle;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.EditText;
import android.widget.ImageView;
import android.widget.TextView;
import android.widget.Toast;

import androidx.annotation.NonNull;
import androidx.appcompat.app.AlertDialog;
import androidx.appcompat.app.AppCompatActivity;
import androidx.recyclerview.widget.LinearLayoutManager;
import androidx.recyclerview.widget.RecyclerView;
import androidx.swiperefreshlayout.widget.SwipeRefreshLayout;

import com.app.myapplication.R;
import com.app.myapplication.data.api.ApiClient;
import com.app.myapplication.data.api.ManagementApi;
import com.app.myapplication.data.model.manage.ProjectItem;

import java.util.ArrayList;
import java.util.List;

import retrofit2.Call;
import retrofit2.Callback;
import retrofit2.Response;

public class ProjectManagementActivity extends AppCompatActivity {

    private RecyclerView recyclerView;
    private ProjectAdapter adapter;
    private List<ProjectItem> projectList = new ArrayList<>();
    private SwipeRefreshLayout swipeRefresh;
    private EditText etSearch;
    private TextView tvEmpty;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_list_management);

        findViewById(R.id.btn_back).setOnClickListener(v -> finish());
        TextView tvTitle = findViewById(R.id.tv_title);
        tvTitle.setText("项目管理");

        etSearch = findViewById(R.id.et_search);
        tvEmpty = findViewById(R.id.tv_empty);
        swipeRefresh = findViewById(R.id.swipe_refresh);
        recyclerView = findViewById(R.id.rv_list);
        recyclerView.setLayoutManager(new LinearLayoutManager(this));
        adapter = new ProjectAdapter();
        recyclerView.setAdapter(adapter);

        findViewById(R.id.btn_search).setOnClickListener(v -> loadProjects());

        swipeRefresh.setOnRefreshListener(this::loadProjects);

        loadProjects();
    }

    private java.util.Map<String, String> getAuthHeaders() {
        java.util.Map<String, String> headers = new java.util.HashMap<>();
        String token = com.app.myapplication.data.local.SessionManager.getToken(this);
        if (token != null && !token.isEmpty()) {
            headers.put("Authorization", "Bearer " + token);
        }
        return headers;
    }

    private void loadProjects() {
        swipeRefresh.setRefreshing(true);
        String search = etSearch.getText().toString().trim();
        if (search.isEmpty()) search = null;

        ApiClient.get(this).create(ManagementApi.class)
                .getProjects(getAuthHeaders())
                .enqueue(new Callback<List<com.google.gson.JsonObject>>() {
                    @Override
                    public void onResponse(Call<List<com.google.gson.JsonObject>> call, Response<List<com.google.gson.JsonObject>> response) {
                        swipeRefresh.setRefreshing(false);
                        if (response.isSuccessful() && response.body() != null) {
                            projectList = parseProjectList(response.body());
                            adapter.notifyDataSetChanged();
                            tvEmpty.setVisibility(projectList.isEmpty() ? View.VISIBLE : View.GONE);
                        } else {
                            Toast.makeText(ProjectManagementActivity.this, "加载失败", Toast.LENGTH_SHORT).show();
                        }
                    }

                    @Override
                    public void onFailure(Call<List<com.google.gson.JsonObject>> call, Throwable t) {
                        swipeRefresh.setRefreshing(false);
                        Toast.makeText(ProjectManagementActivity.this, "网络错误: " + t.getMessage(), Toast.LENGTH_SHORT).show();
                    }
                });
    }

    private List<ProjectItem> parseProjectList(List<com.google.gson.JsonObject> jsonList) {
        List<ProjectItem> list = new ArrayList<>();
        for (com.google.gson.JsonObject json : jsonList) {
            ProjectItem item = new ProjectItem();
            item.setId(json.has("id") ? json.get("id").getAsInt() : 0);
            item.setName(json.has("name") ? json.get("name").getAsString() : "");
            item.setCode(json.has("code") ? json.get("code").getAsString() : "");
            item.setManager(json.has("manager") ? json.get("manager").getAsString() : "");
            item.setManagerName(json.has("manager_name") ? json.get("manager_name").getAsString() : "");
            item.setLocation(json.has("location") ? json.get("location").getAsString() : "");
            item.setStatus(json.has("status") ? json.get("status").getAsString() : "");
            list.add(item);
        }
        return list;
    }

    private void deleteProject(int projectId) {
        new AlertDialog.Builder(this)
                .setTitle("确认删除")
                .setMessage("确定要删除此项目吗？")
                .setPositiveButton("删除", (dialog, which) -> {
                    ApiClient.get(this).create(ManagementApi.class)
                            .deleteProject(getAuthHeaders(), projectId)
                            .enqueue(new Callback<Void>() {
                                @Override
                                public void onResponse(Call<Void> call, Response<Void> response) {
                                    Toast.makeText(ProjectManagementActivity.this, "删除成功", Toast.LENGTH_SHORT).show();
                                    loadProjects();
                                }

                                @Override
                                public void onFailure(Call<Void> call, Throwable t) {
                                    Toast.makeText(ProjectManagementActivity.this, "删除失败", Toast.LENGTH_SHORT).show();
                                }
                            });
                })
                .setNegativeButton("取消", null)
                .show();
    }

    class ProjectAdapter extends RecyclerView.Adapter<ProjectAdapter.VH> {

        @NonNull
        @Override
        public VH onCreateViewHolder(@NonNull ViewGroup parent, int viewType) {
            View v = LayoutInflater.from(parent.getContext()).inflate(R.layout.item_project, parent, false);
            return new VH(v);
        }

        @Override
        public void onBindViewHolder(@NonNull VH holder, int position) {
            ProjectItem item = projectList.get(position);
            holder.tvName.setText(item.getName());
            holder.tvCode.setText("编号: " + (item.getCode() != null ? item.getCode() : "-"));
            holder.tvManager.setText("负责人: " + (item.getManagerName() != null ? item.getManagerName() : item.getManager() != null ? item.getManager() : "-"));
            holder.tvLocation.setText("地点: " + (item.getLocation() != null ? item.getLocation() : "-"));
            holder.tvStatus.setText(item.getStatus() != null ? item.getStatus() : "进行中");

            holder.btnDelete.setOnClickListener(v -> deleteProject(item.getId()));
        }

        @Override
        public int getItemCount() {
            return projectList.size();
        }

        class VH extends RecyclerView.ViewHolder {
            TextView tvName, tvCode, tvManager, tvLocation, tvStatus;
            ImageView btnDelete;

            VH(View itemView) {
                super(itemView);
                tvName = itemView.findViewById(R.id.tv_name);
                tvCode = itemView.findViewById(R.id.tv_code);
                tvManager = itemView.findViewById(R.id.tv_manager);
                tvLocation = itemView.findViewById(R.id.tv_location);
                tvStatus = itemView.findViewById(R.id.tv_status);
                btnDelete = itemView.findViewById(R.id.btn_delete);
            }
        }
    }
}
