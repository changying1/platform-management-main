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
import com.app.myapplication.data.model.manage.Personnel;

import java.util.ArrayList;
import java.util.List;

import retrofit2.Call;
import retrofit2.Callback;
import retrofit2.Response;

public class PersonnelManagementActivity extends AppCompatActivity {

    private RecyclerView recyclerView;
    private PersonnelAdapter adapter;
    private List<Personnel> personnelList = new ArrayList<>();
    private SwipeRefreshLayout swipeRefresh;
    private EditText etSearch;
    private TextView tvEmpty;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_list_management);

        findViewById(R.id.btn_back).setOnClickListener(v -> finish());
        TextView tvTitle = findViewById(R.id.tv_title);
        tvTitle.setText("人员管理");

        etSearch = findViewById(R.id.et_search);
        tvEmpty = findViewById(R.id.tv_empty);
        swipeRefresh = findViewById(R.id.swipe_refresh);
        recyclerView = findViewById(R.id.rv_list);
        recyclerView.setLayoutManager(new LinearLayoutManager(this));
        adapter = new PersonnelAdapter();
        recyclerView.setAdapter(adapter);

        findViewById(R.id.btn_search).setOnClickListener(v -> filterPersonnel());
        swipeRefresh.setOnRefreshListener(this::loadPersonnel);

        loadPersonnel();
    }

    private void loadPersonnel() {
        swipeRefresh.setRefreshing(true);
        ApiClient.get(this).create(ManagementApi.class)
                .getPersonnel()
                .enqueue(new Callback<List<Personnel>>() {
                    @Override
                    public void onResponse(Call<List<Personnel>> call, Response<List<Personnel>> response) {
                        swipeRefresh.setRefreshing(false);
                        if (response.isSuccessful() && response.body() != null) {
                            personnelList = response.body();
                            adapter.notifyDataSetChanged();
                            tvEmpty.setVisibility(personnelList.isEmpty() ? View.VISIBLE : View.GONE);
                        } else {
                            Toast.makeText(PersonnelManagementActivity.this, "加载失败", Toast.LENGTH_SHORT).show();
                        }
                    }

                    @Override
                    public void onFailure(Call<List<Personnel>> call, Throwable t) {
                        swipeRefresh.setRefreshing(false);
                        Toast.makeText(PersonnelManagementActivity.this, "网络错误，使用本地数据", Toast.LENGTH_SHORT).show();
                        loadHardcodedPersonnel();
                    }
                });
    }

    private void loadHardcodedPersonnel() {
        personnelList = new ArrayList<>();
        
        Personnel p1 = new Personnel();
        p1.setId("1");
        p1.setName("张三");
        p1.setEmployeeId("EMP001");
        p1.setWorkType("电工");
        p1.setCompany("中建一局");
        p1.setPhone("13800138001");
        p1.setStatus("active");
        personnelList.add(p1);
        
        Personnel p2 = new Personnel();
        p2.setId("2");
        p2.setName("李四");
        p2.setEmployeeId("EMP002");
        p2.setWorkType("焊工");
        p2.setCompany("中建二局");
        p2.setPhone("13800138002");
        p2.setStatus("active");
        personnelList.add(p2);
        
        Personnel p3 = new Personnel();
        p3.setId("3");
        p3.setName("王五");
        p3.setEmployeeId("EMP003");
        p3.setWorkType("架子工");
        p3.setCompany("中建三局");
        p3.setPhone("13800138003");
        p3.setStatus("active");
        personnelList.add(p3);
        
        Personnel p4 = new Personnel();
        p4.setId("4");
        p4.setName("赵六");
        p4.setEmployeeId("EMP004");
        p4.setWorkType("塔吊司机");
        p4.setCompany("中建一局");
        p4.setPhone("13800138004");
        p4.setStatus("inactive");
        personnelList.add(p4);
        
        Personnel p5 = new Personnel();
        p5.setId("5");
        p5.setName("钱七");
        p5.setEmployeeId("EMP005");
        p5.setWorkType("安全员");
        p5.setCompany("监理公司");
        p5.setPhone("13800138005");
        p5.setStatus("active");
        personnelList.add(p5);
        
        adapter.setData(personnelList);
        tvEmpty.setVisibility(personnelList.isEmpty() ? View.VISIBLE : View.GONE);
    }

    private void filterPersonnel() {
        String keyword = etSearch.getText().toString().trim().toLowerCase();
        if (keyword.isEmpty()) {
            adapter.setData(personnelList);
            return;
        }
        List<Personnel> filtered = new ArrayList<>();
        for (Personnel p : personnelList) {
            String name = p.getName() != null ? p.getName() : "";
            String phone = p.getPhone() != null ? p.getPhone() : "";
            String employeeId = p.getEmployeeId() != null ? p.getEmployeeId() : "";
            if (name.toLowerCase().contains(keyword) || phone.contains(keyword) || employeeId.toLowerCase().contains(keyword)) {
                filtered.add(p);
            }
        }
        adapter.setData(filtered);
        tvEmpty.setVisibility(filtered.isEmpty() ? View.VISIBLE : View.GONE);
    }

    private void deletePersonnel(String personnelId) {
        new AlertDialog.Builder(this)
                .setTitle("确认删除")
                .setMessage("确定要删除此人员吗？")
                .setPositiveButton("删除", (dialog, which) -> {
                    ApiClient.get(this).create(ManagementApi.class)
                            .deletePersonnel(personnelId)
                            .enqueue(new Callback<java.util.Map<String, Object>>() {
                                @Override
                                public void onResponse(Call<java.util.Map<String, Object>> call, Response<java.util.Map<String, Object>> response) {
                                    Toast.makeText(PersonnelManagementActivity.this, "删除成功", Toast.LENGTH_SHORT).show();
                                    loadPersonnel();
                                }

                                @Override
                                public void onFailure(Call<java.util.Map<String, Object>> call, Throwable t) {
                                    Toast.makeText(PersonnelManagementActivity.this, "删除失败", Toast.LENGTH_SHORT).show();
                                }
                            });
                })
                .setNegativeButton("取消", null)
                .show();
    }

    class PersonnelAdapter extends RecyclerView.Adapter<PersonnelAdapter.VH> {
        private List<Personnel> data = new ArrayList<>();

        void setData(List<Personnel> data) {
            this.data = data;
            notifyDataSetChanged();
        }

        @NonNull
        @Override
        public VH onCreateViewHolder(@NonNull ViewGroup parent, int viewType) {
            View v = LayoutInflater.from(parent.getContext()).inflate(R.layout.item_personnel, parent, false);
            return new VH(v);
        }

        @Override
        public void onBindViewHolder(@NonNull VH holder, int position) {
            Personnel item = data.get(position);
            holder.tvName.setText(item.getName() != null ? item.getName() : "-");
            holder.tvEmployeeId.setText("工号: " + (item.getEmployeeId() != null ? item.getEmployeeId() : "-"));
            holder.tvWorkType.setText("工种: " + (item.getWorkType() != null ? item.getWorkType() : "-"));
            holder.tvCompany.setText("公司: " + (item.getCompany() != null ? item.getCompany() : "-"));
            holder.tvPhone.setText("电话: " + (item.getPhone() != null ? item.getPhone() : "-"));

            String status = item.getStatus() != null ? item.getStatus() : "active";
            holder.tvStatus.setText(status.equals("active") ? "在职" : "离职");
            holder.tvStatus.setBackgroundResource(status.equals("active") ? R.drawable.bg_circle_green : R.drawable.bg_circle_gray);

            holder.btnDelete.setOnClickListener(v -> deletePersonnel(item.getId()));
        }

        @Override
        public int getItemCount() {
            return data.size();
        }

        class VH extends RecyclerView.ViewHolder {
            TextView tvName, tvEmployeeId, tvWorkType, tvCompany, tvPhone, tvStatus;
            ImageView btnDelete;

            VH(View itemView) {
                super(itemView);
                tvName = itemView.findViewById(R.id.tv_name);
                tvEmployeeId = itemView.findViewById(R.id.tv_employee_id);
                tvWorkType = itemView.findViewById(R.id.tv_work_type);
                tvCompany = itemView.findViewById(R.id.tv_company);
                tvPhone = itemView.findViewById(R.id.tv_phone);
                tvStatus = itemView.findViewById(R.id.tv_status);
                btnDelete = itemView.findViewById(R.id.btn_delete);
            }
        }
    }
}
