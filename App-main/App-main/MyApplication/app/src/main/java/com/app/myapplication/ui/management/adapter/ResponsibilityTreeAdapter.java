package com.app.myapplication.ui.management.adapter;

import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.TextView;

import androidx.annotation.NonNull;
import androidx.recyclerview.widget.RecyclerView;

import com.app.myapplication.R;
import com.app.myapplication.data.model.ResponsibilityUnit;

import java.util.ArrayList;
import java.util.List;

/**
 * 责任树形适配器 - 展示公司-项目-网格-工队的层级结构
 */
public class ResponsibilityTreeAdapter extends RecyclerView.Adapter<ResponsibilityTreeAdapter.ViewHolder> {

    private List<ResponsibilityUnit> units;
    private List<ResponsibilityUnit> flattenedList;
    private OnUnitClickListener listener;
    
    public interface OnUnitClickListener {
        void onUnitClick(ResponsibilityUnit unit);
    }

    public ResponsibilityTreeAdapter(List<ResponsibilityUnit> units) {
        this.units = units;
        this.flattenedList = flattenList(units);
    }
    
    public ResponsibilityTreeAdapter(List<ResponsibilityUnit> units, OnUnitClickListener listener) {
        this.units = units;
        this.flattenedList = flattenList(units);
        this.listener = listener;
    }

    @NonNull
    @Override
    public ViewHolder onCreateViewHolder(@NonNull ViewGroup parent, int viewType) {
        View view = LayoutInflater.from(parent.getContext())
                .inflate(R.layout.item_responsibility_tree, parent, false);
        return new ViewHolder(view);
    }

    @Override
    public void onBindViewHolder(@NonNull ViewHolder holder, int position) {
        ResponsibilityUnit unit = flattenedList.get(position);
        holder.bind(unit);
        
        // 展开/收起点击
        holder.itemView.setOnClickListener(v -> {
            if (unit.getChildren() != null && !unit.getChildren().isEmpty()) {
                unit.setExpanded(!unit.isExpanded());
                flattenedList = flattenList(units);
                notifyDataSetChanged();
            }
        });
    }

    @Override
    public int getItemCount() {
        return flattenedList != null ? flattenedList.size() : 0;
    }
    
    /**
     * 更新数据
     */
    public void updateData(List<ResponsibilityUnit> newUnits) {
        this.units = newUnits;
        this.flattenedList = flattenList(newUnits);
        notifyDataSetChanged();
    }

    /**
     * 将树形结构扁平化
     */
    private List<ResponsibilityUnit> flattenList(List<ResponsibilityUnit> list) {
        List<ResponsibilityUnit> result = new ArrayList<>();
        if (list == null) return result;
        for (ResponsibilityUnit unit : list) {
            if (unit == null) continue;
            result.add(unit);
            if (unit.isExpanded() && unit.getChildren() != null) {
                result.addAll(flattenList(unit.getChildren()));
            }
        }
        return result;
    }

    static class ViewHolder extends RecyclerView.ViewHolder {
        private final LinearLayout container;
        private final ImageView ivExpand;
        private final ImageView ivIcon;
        private final TextView tvName;
        private final TextView tvType;
        private final TextView tvInfo;
        private final View indentView;

        public ViewHolder(@NonNull View itemView) {
            super(itemView);
            container = itemView.findViewById(R.id.container);
            ivExpand = itemView.findViewById(R.id.iv_expand);
            ivIcon = itemView.findViewById(R.id.iv_icon);
            tvName = itemView.findViewById(R.id.tv_name);
            tvType = itemView.findViewById(R.id.tv_type);
            tvInfo = itemView.findViewById(R.id.tv_info);
            indentView = itemView.findViewById(R.id.indent_view);
        }

        public void bind(ResponsibilityUnit unit) {
            // 缩进
            int indent = unit.getLevel() * 32; // 32dp per level
            indentView.getLayoutParams().width = indent;
            
            // 名称和类型
            tvName.setText(unit.getName());
            tvType.setText(unit.getTypeLabel());
            
            // 图标
            int iconRes = getIconForType(unit.getType());
            ivIcon.setImageResource(iconRes);
            
            // 展开/收起图标
            if (unit.getChildren() != null && !unit.getChildren().isEmpty()) {
                ivExpand.setVisibility(View.VISIBLE);
                ivExpand.setImageResource(unit.isExpanded() 
                    ? R.drawable.ic_expand_less 
                    : R.drawable.ic_expand_more);
            } else {
                ivExpand.setVisibility(View.INVISIBLE);
            }
            
            // 信息
            String info = String.format("人员: %d | 设备: %d", 
                unit.getPersonnelCount(), unit.getDeviceCount());
            tvInfo.setText(info);
            
            // 背景色根据层级
            int bgColor = getBackgroundColorForLevel(unit.getLevel());
            container.setBackgroundColor(bgColor);
        }

        private int getIconForType(String type) {
            switch (type) {
                case "company":
                case "branch":
                    return R.drawable.ic_company;
                case "project":
                    return R.drawable.ic_project;
                case "safety_office":
                    return R.drawable.ic_grid;
                case "grid":
                    return R.drawable.ic_grid;
                case "team":
                    return R.drawable.ic_team;
                default:
                    return R.drawable.ic_folder;
            }
        }

        private int getBackgroundColorForLevel(int level) {
            // 使用明显的边框颜色来区分层级
            switch (level) {
                case 0: return 0xFFBBDEFB; // 分公司 - 蓝色
                case 1: return 0xFFC8E6C9; // 项目 - 绿色
                case 2: return 0xFFFFE0B2; // 安监办 - 橙色
                case 3: return 0xFFE1BEE7; // 网格 - 紫色
                case 4: return 0xFFFFCDD2; // 工队 - 红色
                default: return 0xFFFFFFFF; // 默认白色
            }
        }
    }
}
