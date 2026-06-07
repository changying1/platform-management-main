package com.app.myapplication.ui.manage;

import android.os.Bundle;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.ImageView;
import android.widget.TextView;
import android.widget.Toast;

import androidx.annotation.NonNull;
import androidx.appcompat.app.AppCompatActivity;
import androidx.fragment.app.Fragment;
import androidx.recyclerview.widget.LinearLayoutManager;
import androidx.recyclerview.widget.RecyclerView;
import androidx.swiperefreshlayout.widget.SwipeRefreshLayout;
import androidx.viewpager2.widget.ViewPager2;

import com.app.myapplication.R;
import com.app.myapplication.data.api.ApiClient;
import com.app.myapplication.data.api.ManagementApi;
import com.app.myapplication.data.model.manage.GridItem;
import com.app.myapplication.data.model.manage.GridPersonnel;
import com.app.myapplication.data.model.manage.ResponsibilityUnit;
import com.google.android.material.tabs.TabLayout;
import com.google.android.material.tabs.TabLayoutMediator;

import java.util.ArrayList;
import java.util.List;

import retrofit2.Call;
import retrofit2.Callback;
import retrofit2.Response;

public class GridManagementActivity extends AppCompatActivity {

    private TabLayout tabLayout;
    private ViewPager2 viewPager;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_device_management);

        findViewById(R.id.btn_back).setOnClickListener(v -> finish());
        TextView tvTitle = findViewById(R.id.tv_title);
        tvTitle.setText("网格管理");

        tabLayout = findViewById(R.id.tab_layout);
        viewPager = findViewById(R.id.view_pager);

        GridPagerAdapter adapter = new GridPagerAdapter(this);
        viewPager.setAdapter(adapter);

        new TabLayoutMediator(tabLayout, viewPager, (tab, position) -> {
            switch (position) {
                case 0: tab.setText("网格列表"); break;
                case 1: tab.setText("责任分配"); break;
                case 2: tab.setText("责任单元"); break;
            }
        }).attach();
    }

    // ==================== 网格列表 Fragment ====================
    public static class GridListFragment extends Fragment {
        private RecyclerView recyclerView;
        private GridListAdapter adapter;
        private List<GridItem> gridList = new ArrayList<>();
        private SwipeRefreshLayout swipeRefresh;
        private TextView tvEmpty;

        @Override
        public View onCreateView(LayoutInflater inflater, ViewGroup container, Bundle savedInstanceState) {
            View view = inflater.inflate(R.layout.fragment_list_with_refresh, container, false);
            swipeRefresh = view.findViewById(R.id.swipe_refresh);
            recyclerView = view.findViewById(R.id.rv_list);
            tvEmpty = view.findViewById(R.id.tv_empty);

            recyclerView.setLayoutManager(new LinearLayoutManager(getContext()));
            adapter = new GridListAdapter();
            recyclerView.setAdapter(adapter);

            swipeRefresh.setOnRefreshListener(this::loadGrids);
            loadGrids();
            return view;
        }

        private void loadGrids() {
            swipeRefresh.setRefreshing(true);
            ApiClient.get(requireContext()).create(ManagementApi.class)
                    .getGrids(null, null)
                    .enqueue(new Callback<List<GridItem>>() {
                        @Override
                        public void onResponse(Call<List<GridItem>> call, Response<List<GridItem>> response) {
                            swipeRefresh.setRefreshing(false);
                            if (response.isSuccessful() && response.body() != null) {
                                gridList = response.body();
                                adapter.setData(gridList);
                                tvEmpty.setVisibility(gridList.isEmpty() ? View.VISIBLE : View.GONE);
                            } else {
                                loadHardcodedGrids();
                            }
                        }

                        @Override
                        public void onFailure(Call<List<GridItem>> call, Throwable t) {
                            swipeRefresh.setRefreshing(false);
                            loadHardcodedGrids();
                        }
                    });
        }

        private void loadHardcodedGrids() {
            gridList = new ArrayList<>();
            GridItem g1 = new GridItem();
            g1.setId("1");
            g1.setName("A区施工网格");
            g1.setGridId("GRID001");
            g1.setLevel("project");
            g1.setDescription("A区主体施工区域");
            gridList.add(g1);

            GridItem g2 = new GridItem();
            g2.setId("2");
            g2.setName("B区安全网格");
            g2.setGridId("GRID002");
            g2.setLevel("workshop");
            g2.setDescription("B区安全管理区域");
            gridList.add(g2);

            GridItem g3 = new GridItem();
            g3.setId("3");
            g3.setName("C区质量网格");
            g3.setGridId("GRID003");
            g3.setLevel("team");
            g3.setDescription("C区质量管控区域");
            gridList.add(g3);

            adapter.setData(gridList);
            tvEmpty.setVisibility(gridList.isEmpty() ? View.VISIBLE : View.GONE);
            Toast.makeText(getContext(), "使用本地数据", Toast.LENGTH_SHORT).show();
        }
    }

    // ==================== 责任分配 Fragment ====================
    public static class PersonnelFragment extends Fragment {
        private RecyclerView recyclerView;
        private PersonnelAdapter adapter;
        private List<GridPersonnel> personnelList = new ArrayList<>();
        private SwipeRefreshLayout swipeRefresh;
        private TextView tvEmpty;

        @Override
        public View onCreateView(LayoutInflater inflater, ViewGroup container, Bundle savedInstanceState) {
            View view = inflater.inflate(R.layout.fragment_list_with_refresh, container, false);
            swipeRefresh = view.findViewById(R.id.swipe_refresh);
            recyclerView = view.findViewById(R.id.rv_list);
            tvEmpty = view.findViewById(R.id.tv_empty);

            recyclerView.setLayoutManager(new LinearLayoutManager(getContext()));
            adapter = new PersonnelAdapter();
            recyclerView.setAdapter(adapter);

            swipeRefresh.setOnRefreshListener(this::loadPersonnel);
            loadPersonnel();
            return view;
        }

        private void loadPersonnel() {
            swipeRefresh.setRefreshing(true);
            ApiClient.get(requireContext()).create(ManagementApi.class)
                    .getGridPersonnel(null, null)
                    .enqueue(new Callback<List<GridPersonnel>>() {
                        @Override
                        public void onResponse(Call<List<GridPersonnel>> call, Response<List<GridPersonnel>> response) {
                            swipeRefresh.setRefreshing(false);
                            if (response.isSuccessful() && response.body() != null) {
                                personnelList = response.body();
                                adapter.setData(personnelList);
                                tvEmpty.setVisibility(personnelList.isEmpty() ? View.VISIBLE : View.GONE);
                            } else {
                                loadHardcodedPersonnel();
                            }
                        }

                        @Override
                        public void onFailure(Call<List<GridPersonnel>> call, Throwable t) {
                            swipeRefresh.setRefreshing(false);
                            loadHardcodedPersonnel();
                        }
                    });
        }

        private void loadHardcodedPersonnel() {
            personnelList = new ArrayList<>();
            GridPersonnel p1 = new GridPersonnel();
            p1.setId("1");
            p1.setName("张三");
            p1.setRole("grid_manager");
            p1.setPhone("13800138001");
            p1.setDepartment("安全部");
            personnelList.add(p1);

            GridPersonnel p2 = new GridPersonnel();
            p2.setId("2");
            p2.setName("李四");
            p2.setRole("safety_manager");
            p2.setPhone("13800138002");
            p2.setDepartment("工程部");
            personnelList.add(p2);

            GridPersonnel p3 = new GridPersonnel();
            p3.setId("3");
            p3.setName("王五");
            p3.setRole("technician");
            p3.setPhone("13800138003");
            p3.setDepartment("技术部");
            personnelList.add(p3);

            adapter.setData(personnelList);
            tvEmpty.setVisibility(personnelList.isEmpty() ? View.VISIBLE : View.GONE);
            Toast.makeText(getContext(), "使用本地数据", Toast.LENGTH_SHORT).show();
        }
    }

    // ==================== 责任单元 Fragment ====================
    public static class UnitFragment extends Fragment {
        private RecyclerView recyclerView;
        private UnitAdapter adapter;
        private List<ResponsibilityUnit> unitList = new ArrayList<>();
        private SwipeRefreshLayout swipeRefresh;
        private TextView tvEmpty;

        @Override
        public View onCreateView(LayoutInflater inflater, ViewGroup container, Bundle savedInstanceState) {
            View view = inflater.inflate(R.layout.fragment_list_with_refresh, container, false);
            swipeRefresh = view.findViewById(R.id.swipe_refresh);
            recyclerView = view.findViewById(R.id.rv_list);
            tvEmpty = view.findViewById(R.id.tv_empty);

            recyclerView.setLayoutManager(new LinearLayoutManager(getContext()));
            adapter = new UnitAdapter();
            recyclerView.setAdapter(adapter);

            swipeRefresh.setOnRefreshListener(this::loadUnits);
            loadUnits();
            return view;
        }

        private void loadUnits() {
            swipeRefresh.setRefreshing(true);
            ApiClient.get(requireContext()).create(ManagementApi.class)
                    .getResponsibilityUnitTree()
                    .enqueue(new Callback<List<ResponsibilityUnit>>() {
                        @Override
                        public void onResponse(Call<List<ResponsibilityUnit>> call, Response<List<ResponsibilityUnit>> response) {
                            swipeRefresh.setRefreshing(false);
                            if (response.isSuccessful() && response.body() != null) {
                                unitList = response.body();
                                adapter.setData(unitList);
                                tvEmpty.setVisibility(unitList.isEmpty() ? View.VISIBLE : View.GONE);
                            } else {
                                loadHardcodedUnits();
                            }
                        }

                        @Override
                        public void onFailure(Call<List<ResponsibilityUnit>> call, Throwable t) {
                            swipeRefresh.setRefreshing(false);
                            loadHardcodedUnits();
                        }
                    });
        }

        private void loadHardcodedUnits() {
            unitList = new ArrayList<>();
            ResponsibilityUnit u1 = new ResponsibilityUnit();
            u1.setId("1");
            u1.setUnitId("UNIT001");
            u1.setName("第一分部");
            u1.setType("division");
            u1.setLevel(1);
            u1.setUnderConstruction(true);
            unitList.add(u1);

            ResponsibilityUnit u2 = new ResponsibilityUnit();
            u2.setId("2");
            u2.setUnitId("UNIT002");
            u2.setName("A工区");
            u2.setType("workshop");
            u2.setLevel(2);
            u2.setUnderConstruction(true);
            unitList.add(u2);

            ResponsibilityUnit u3 = new ResponsibilityUnit();
            u3.setId("3");
            u3.setUnitId("UNIT003");
            u3.setName("1号工点");
            u3.setType("site");
            u3.setLevel(3);
            u3.setUnderConstruction(false);
            unitList.add(u3);

            adapter.setData(unitList);
            tvEmpty.setVisibility(unitList.isEmpty() ? View.VISIBLE : View.GONE);
            Toast.makeText(getContext(), "使用本地数据", Toast.LENGTH_SHORT).show();
        }
    }

    // ==================== Adapters ====================
    public static class GridListAdapter extends RecyclerView.Adapter<GridListAdapter.VH> {
        private List<GridItem> data = new ArrayList<>();

        void setData(List<GridItem> data) {
            this.data = data;
            notifyDataSetChanged();
        }

        @NonNull
        @Override
        public VH onCreateViewHolder(@NonNull ViewGroup parent, int viewType) {
            View v = LayoutInflater.from(parent.getContext()).inflate(R.layout.item_grid, parent, false);
            return new VH(v);
        }

        @Override
        public void onBindViewHolder(@NonNull VH holder, int position) {
            GridItem item = data.get(position);
            holder.tvName.setText(item.getName());
            holder.tvGridId.setText("网格ID: " + (item.getGridId() != null ? item.getGridId() : "-"));
            holder.tvLevel.setText("层级: " + formatLevel(item.getLevel()));
            holder.tvDescription.setText(item.getDescription() != null ? item.getDescription() : "暂无描述");
        }

        private String formatLevel(String level) {
            if (level == null) return "-";
            switch (level) {
                case "project": return "项目级";
                case "workshop": return "车间级";
                case "team": return "班组级";
                case "workface": return "工作面级";
                default: return level;
            }
        }

        @Override
        public int getItemCount() { return data.size(); }

        class VH extends RecyclerView.ViewHolder {
            TextView tvName, tvGridId, tvLevel, tvDescription;
            VH(View itemView) {
                super(itemView);
                tvName = itemView.findViewById(R.id.tv_name);
                tvGridId = itemView.findViewById(R.id.tv_grid_id);
                tvLevel = itemView.findViewById(R.id.tv_level);
                tvDescription = itemView.findViewById(R.id.tv_description);
            }
        }
    }

    public static class PersonnelAdapter extends RecyclerView.Adapter<PersonnelAdapter.VH> {
        private List<GridPersonnel> data = new ArrayList<>();

        void setData(List<GridPersonnel> data) {
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
            GridPersonnel item = data.get(position);
            holder.tvName.setText(item.getName());
            holder.tvRole.setText("角色: " + item.getRoleDisplayName());
            holder.tvPhone.setText("电话: " + (item.getPhone() != null ? item.getPhone() : "-"));
            holder.tvDepartment.setText("部门: " + (item.getDepartment() != null ? item.getDepartment() : "-"));
        }

        @Override
        public int getItemCount() { return data.size(); }

        class VH extends RecyclerView.ViewHolder {
            TextView tvName, tvRole, tvPhone, tvDepartment;
            VH(View itemView) {
                super(itemView);
                tvName = itemView.findViewById(R.id.tv_name);
                tvRole = itemView.findViewById(R.id.tv_work_type);
                tvPhone = itemView.findViewById(R.id.tv_phone);
                tvDepartment = itemView.findViewById(R.id.tv_company);
            }
        }
    }

    // 树状节点包装类，包含层级深度信息
    public static class UnitTreeNode {
        ResponsibilityUnit unit;
        int depth;
        boolean isExpanded;
        boolean hasChildren;

        UnitTreeNode(ResponsibilityUnit unit, int depth, boolean hasChildren) {
            this.unit = unit;
            this.depth = depth;
            this.hasChildren = hasChildren;
            this.isExpanded = true;
        }
    }

    public static class UnitAdapter extends RecyclerView.Adapter<UnitAdapter.VH> {
        private List<UnitTreeNode> data = new ArrayList<>();
        private List<ResponsibilityUnit> rawData = new ArrayList<>();

        void setData(List<ResponsibilityUnit> units) {
            this.rawData = units;
            this.data = flattenTree(units, 0);
            notifyDataSetChanged();
        }

        private List<UnitTreeNode> flattenTree(List<ResponsibilityUnit> units, int depth) {
            List<UnitTreeNode> result = new ArrayList<>();
            for (ResponsibilityUnit unit : units) {
                boolean hasChildren = unit.getChildren() != null && !unit.getChildren().isEmpty();
                UnitTreeNode node = new UnitTreeNode(unit, depth, hasChildren);
                result.add(node);
                if (hasChildren && node.isExpanded) {
                    result.addAll(flattenTree(unit.getChildren(), depth + 1));
                }
            }
            return result;
        }

        @NonNull
        @Override
        public VH onCreateViewHolder(@NonNull ViewGroup parent, int viewType) {
            View v = LayoutInflater.from(parent.getContext()).inflate(R.layout.item_responsibility_unit, parent, false);
            return new VH(v);
        }

        @Override
        public void onBindViewHolder(@NonNull VH holder, int position) {
            UnitTreeNode node = data.get(position);
            ResponsibilityUnit item = node.unit;

            // 设置缩进
            int indentPx = (int) (node.depth * 24 * holder.itemView.getContext().getResources().getDisplayMetrics().density);
            holder.indentView.getLayoutParams().width = indentPx;
            holder.indentView.requestLayout();

            // 展开/折叠图标
            if (node.hasChildren) {
                holder.ivExpand.setVisibility(View.VISIBLE);
                holder.ivExpand.setRotation(node.isExpanded ? 90 : 0);
            } else {
                holder.ivExpand.setVisibility(View.INVISIBLE);
            }

            // 节点颜色根据层级变化
            int nodeColor;
            switch (node.depth) {
                case 0: nodeColor = 0xFF3B82F6; break; // 蓝色 - 根节点
                case 1: nodeColor = 0xFF10B981; break; // 绿色
                case 2: nodeColor = 0xFFF59E0B; break; // 黄色
                default: nodeColor = 0xFF6B7280; break; // 灰色
            }
            holder.nodeIndicator.getBackground().setColorFilter(nodeColor, android.graphics.PorterDuff.Mode.SRC_IN);

            // 文本内容
            holder.tvName.setText(item.getName());
            holder.tvType.setText(item.getTypeDisplayName());
            holder.tvUnitId.setText("ID: " + (item.getUnitId() != null ? item.getUnitId() : "-"));

            // 状态
            if (item.isUnderConstruction()) {
                holder.tvStatus.setText("施工中");
                holder.tvStatus.setBackgroundResource(R.drawable.bg_circle_green);
            } else {
                holder.tvStatus.setText("已完成");
                holder.tvStatus.setBackgroundResource(R.drawable.bg_circle_gray);
            }

            // 点击展开/折叠
            holder.itemView.setOnClickListener(v -> {
                if (node.hasChildren) {
                    node.isExpanded = !node.isExpanded;
                    data = flattenTree(rawData, 0);
                    notifyDataSetChanged();
                }
            });
        }

        @Override
        public int getItemCount() { return data.size(); }

        class VH extends RecyclerView.ViewHolder {
            View indentView, nodeIndicator;
            ImageView ivExpand;
            TextView tvName, tvType, tvUnitId, tvStatus;

            VH(View itemView) {
                super(itemView);
                indentView = itemView.findViewById(R.id.indent_view);
                ivExpand = itemView.findViewById(R.id.iv_expand);
                nodeIndicator = itemView.findViewById(R.id.node_indicator);
                tvName = itemView.findViewById(R.id.tv_name);
                tvType = itemView.findViewById(R.id.tv_type);
                tvUnitId = itemView.findViewById(R.id.tv_unit_id);
                tvStatus = itemView.findViewById(R.id.tv_status);
            }
        }
    }

    public static class GridPagerAdapter extends androidx.viewpager2.adapter.FragmentStateAdapter {
        public GridPagerAdapter(AppCompatActivity activity) {
            super(activity);
        }

        @NonNull
        @Override
        public Fragment createFragment(int position) {
            switch (position) {
                case 0: return new GridListFragment();
                case 1: return new PersonnelFragment();
                case 2: return new UnitFragment();
                default: return new GridListFragment();
            }
        }

        @Override
        public int getItemCount() { return 3; }
    }
}
