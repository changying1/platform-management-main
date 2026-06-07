package com.app.myapplication.ui.manage;

import android.content.Intent;
import android.os.Bundle;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.ImageView;
import android.widget.TextView;

import androidx.annotation.NonNull;
import androidx.appcompat.app.AppCompatActivity;
import androidx.recyclerview.widget.GridLayoutManager;
import androidx.recyclerview.widget.RecyclerView;

import com.app.myapplication.R;

import java.util.ArrayList;
import java.util.List;

public class ManagementCenterActivity extends AppCompatActivity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_management_center);

        findViewById(R.id.btn_back).setOnClickListener(v -> finish());

        RecyclerView rvModules = findViewById(R.id.rv_modules);
        rvModules.setLayoutManager(new GridLayoutManager(this, 2));
        int spacingPx = (int) (12 * getResources().getDisplayMetrics().density);
        rvModules.addItemDecoration(new GridSpacingItemDecoration(2, spacingPx, true));

        List<ModuleItem> modules = new ArrayList<>();
        modules.add(new ModuleItem("项目管理", R.drawable.ic_administrator, ProjectManagementActivity.class));
        modules.add(new ModuleItem("网格管理", R.drawable.ic_administrator, GridManagementActivity.class));
        modules.add(new ModuleItem("人员管理", R.drawable.ic_administrator, PersonnelManagementActivity.class));
        modules.add(new ModuleItem("设备管理", R.drawable.ic_administrator, DeviceManagementActivity.class));
        modules.add(new ModuleItem("权限管理", R.drawable.ic_administrator, PermissionManagementActivity.class));

        ModuleAdapter adapter = new ModuleAdapter(modules);
        rvModules.setAdapter(adapter);
    }

    static class ModuleItem {
        String title;
        int iconRes;
        Class<?> targetActivity;

        ModuleItem(String title, int iconRes, Class<?> targetActivity) {
            this.title = title;
            this.iconRes = iconRes;
            this.targetActivity = targetActivity;
        }
    }

    class ModuleAdapter extends RecyclerView.Adapter<ModuleAdapter.VH> {
        List<ModuleItem> list;

        ModuleAdapter(List<ModuleItem> list) {
            this.list = list;
        }

        @NonNull
        @Override
        public VH onCreateViewHolder(@NonNull ViewGroup parent, int viewType) {
            View v = LayoutInflater.from(parent.getContext()).inflate(R.layout.item_management_module, parent, false);
            return new VH(v);
        }

        @Override
        public void onBindViewHolder(@NonNull VH holder, int position) {
            ModuleItem item = list.get(position);
            holder.tvTitle.setText(item.title);
            holder.ivIcon.setImageResource(item.iconRes);
            holder.itemView.setOnClickListener(v -> {
                Intent intent = new Intent(ManagementCenterActivity.this, item.targetActivity);
                startActivity(intent);
            });
        }

        @Override
        public int getItemCount() {
            return list.size();
        }

        class VH extends RecyclerView.ViewHolder {
            ImageView ivIcon;
            TextView tvTitle;

            VH(View itemView) {
                super(itemView);
                ivIcon = itemView.findViewById(R.id.iv_icon);
                tvTitle = itemView.findViewById(R.id.tv_title);
            }
        }
    }

    static class GridSpacingItemDecoration extends RecyclerView.ItemDecoration {
        private int spanCount;
        private int spacing;
        private boolean includeEdge;

        GridSpacingItemDecoration(int spanCount, int spacing, boolean includeEdge) {
            this.spanCount = spanCount;
            this.spacing = spacing;
            this.includeEdge = includeEdge;
        }

        @Override
        public void getItemOffsets(@NonNull android.graphics.Rect outRect, @NonNull View view,
                                   @NonNull RecyclerView parent, @NonNull RecyclerView.State state) {
            int position = parent.getChildAdapterPosition(view);
            int column = position % spanCount;
            if (includeEdge) {
                outRect.left = spacing - column * spacing / spanCount;
                outRect.right = (column + 1) * spacing / spanCount;
                if (position < spanCount) outRect.top = spacing;
                outRect.bottom = spacing;
            } else {
                outRect.left = column * spacing / spanCount;
                outRect.right = spacing - (column + 1) * spacing / spanCount;
                if (position >= spanCount) outRect.top = spacing;
            }
        }
    }
}
