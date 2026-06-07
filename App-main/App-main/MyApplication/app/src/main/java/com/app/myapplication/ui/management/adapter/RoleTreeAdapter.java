package com.app.myapplication.ui.management.adapter;

import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.ImageView;
import android.widget.TextView;

import androidx.annotation.NonNull;
import androidx.recyclerview.widget.RecyclerView;

import com.app.myapplication.R;
import com.app.myapplication.data.model.RoleTreeNode;

import java.util.ArrayList;
import java.util.List;

/**
 * 角色树适配器 - 与 Web 端 RoleTreeItem 组件对齐
 * 支持公司/项目/工队/角色四种节点类型
 */
public class RoleTreeAdapter extends RecyclerView.Adapter<RoleTreeAdapter.ViewHolder> {

    private List<RoleTreeNode> nodes;
    private List<RoleTreeNode> flattenedList = new ArrayList<>();
    private OnNodeSelectedListener listener;
    private String selectedRoleId = null;

    public interface OnNodeSelectedListener {
        void onNodeSelected(RoleTreeNode node);
    }

    public RoleTreeAdapter(List<RoleTreeNode> nodes, OnNodeSelectedListener listener) {
        this.nodes = nodes;
        this.listener = listener;
        flattenList();
    }

    public void updateData(List<RoleTreeNode> newNodes) {
        this.nodes = newNodes;
        flattenList();
        notifyDataSetChanged();
    }

    private void flattenList() {
        flattenedList.clear();
        for (RoleTreeNode node : nodes) {
            addNodeToFlattenedList(node, 0);
        }
    }

    private void addNodeToFlattenedList(RoleTreeNode node, int depth) {
        node.setDepth(depth);
        flattenedList.add(node);
        if (node.isExpanded() && node.hasChildren()) {
            for (RoleTreeNode child : node.getChildren()) {
                addNodeToFlattenedList(child, depth + 1);
            }
        }
    }

    @NonNull
    @Override
    public ViewHolder onCreateViewHolder(@NonNull ViewGroup parent, int viewType) {
        View view = LayoutInflater.from(parent.getContext())
                .inflate(R.layout.item_role_tree, parent, false);
        return new ViewHolder(view);
    }

    @Override
    public void onBindViewHolder(@NonNull ViewHolder holder, int position) {
        RoleTreeNode node = flattenedList.get(position);
        boolean isSelected = node.getRoleId() != null && node.getRoleId().equals(selectedRoleId);
        holder.bind(node, isSelected);
        
        holder.itemView.setOnClickListener(v -> {
            if (node.getType() == RoleTreeNode.NodeType.ROLE) {
                String previousSelected = selectedRoleId;
                selectedRoleId = node.getRoleId();
                notifyDataSetChanged();
                if (listener != null) {
                    listener.onNodeSelected(node);
                }
            } else if (node.hasChildren()) {
                // 展开/折叠
                node.setExpanded(!node.isExpanded());
                flattenList();
                notifyDataSetChanged();
            }
        });
        
        // 展开图标点击
        holder.ivExpand.setOnClickListener(v -> {
            if (node.hasChildren()) {
                node.setExpanded(!node.isExpanded());
                flattenList();
                notifyDataSetChanged();
            }
        });
    }

    @Override
    public int getItemCount() {
        return flattenedList.size();
    }

    class ViewHolder extends RecyclerView.ViewHolder {
        private final View viewIndent;
        private final ImageView ivExpand;
        private final ImageView ivIcon;
        private final TextView tvName;

        public ViewHolder(@NonNull View itemView) {
            super(itemView);
            viewIndent = itemView.findViewById(R.id.view_indent);
            ivExpand = itemView.findViewById(R.id.iv_expand);
            ivIcon = itemView.findViewById(R.id.iv_icon);
            tvName = itemView.findViewById(R.id.tv_name);
        }

        public void bind(RoleTreeNode node, boolean isSelected) {
            // 缩进 - 与 Web 端 style={{ paddingLeft: `${level * 16 + 8}px` }} 对齐
            int depth = node.getDepth();
            ViewGroup.LayoutParams params = viewIndent.getLayoutParams();
            params.width = depth * 16 + 8;
            viewIndent.setLayoutParams(params);
            
            // 展开图标 - 与 Web 端 ChevronDown/ChevronRight 对齐
            if (node.hasChildren()) {
                ivExpand.setVisibility(View.VISIBLE);
                ivExpand.setImageResource(node.isExpanded() 
                    ? R.drawable.ic_expand_less 
                    : R.drawable.ic_expand_more);
            } else {
                ivExpand.setVisibility(View.INVISIBLE);
            }
            
            // 节点图标 - 与 Web 端 getIcon() 对齐
            ivIcon.setImageResource(getIconForType(node.getType()));
            ivIcon.setColorFilter(getColorForType(node.getType()));
            
            // 节点名称
            tvName.setText(node.getName());
            
            // 样式 - 与 Web 端对齐
            // isRole && isSelected -> 'bg-cyan-500/20 text-cyan-300'
            // isRole -> 'hover:bg-slate-700/50 text-slate-200'
            // else -> 'text-slate-400'
            if (node.getType() == RoleTreeNode.NodeType.ROLE) {
                if (isSelected) {
                    itemView.setBackgroundResource(R.drawable.bg_role_selected);
                    tvName.setTextColor(itemView.getContext().getColor(R.color.cyan_300));
                } else {
                    itemView.setBackgroundResource(R.drawable.bg_role_normal);
                    tvName.setTextColor(itemView.getContext().getColor(R.color.slate_200));
                }
            } else {
                itemView.setBackgroundResource(R.drawable.bg_role_normal);
                tvName.setTextColor(itemView.getContext().getColor(R.color.slate_400));
            }
        }
        
        private int getIconForType(RoleTreeNode.NodeType type) {
            switch (type) {
                case COMPANY:
                    return R.drawable.ic_company;  // Building2
                case PROJECT:
                    return R.drawable.ic_project;  // FolderTree
                case TEAM:
                    return R.drawable.ic_team;     // Users
                case ROLE:
                    return R.drawable.ic_role;     // Shield
                default:
                    return R.drawable.ic_role;
            }
        }
        
        private int getColorForType(RoleTreeNode.NodeType type) {
            switch (type) {
                case COMPANY:
                    return itemView.getContext().getColor(R.color.cyan_400);
                case PROJECT:
                    return itemView.getContext().getColor(R.color.blue_400);
                case TEAM:
                    return itemView.getContext().getColor(R.color.orange_400);
                case ROLE:
                    return itemView.getContext().getColor(R.color.green_400);
                default:
                    return itemView.getContext().getColor(R.color.slate_400);
            }
        }
    }
}
