package com.app.myapplication.ui.management.adapter;

import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.ImageView;
import android.widget.PopupMenu;
import android.widget.TextView;

import androidx.annotation.NonNull;
import androidx.recyclerview.widget.RecyclerView;

import com.app.myapplication.R;
import com.app.myapplication.data.model.Project;

import java.util.List;

/**
 * 项目列表适配器
 */
public class ProjectAdapter extends RecyclerView.Adapter<ProjectAdapter.ViewHolder> {

    private List<Project> projects;
    private OnProjectActionListener listener;

    public interface OnProjectActionListener {
        void onEdit(Project project);
        void onDelete(Project project);
        void onViewDetail(Project project);
    }

    public ProjectAdapter(List<Project> projects, OnProjectActionListener listener) {
        this.projects = projects;
        this.listener = listener;
    }

    @NonNull
    @Override
    public ViewHolder onCreateViewHolder(@NonNull ViewGroup parent, int viewType) {
        View view = LayoutInflater.from(parent.getContext())
                .inflate(R.layout.item_project, parent, false);
        return new ViewHolder(view);
    }

    @Override
    public void onBindViewHolder(@NonNull ViewHolder holder, int position) {
        Project project = projects.get(position);
        holder.bind(project);
    }

    @Override
    public int getItemCount() {
        return projects.size();
    }

    class ViewHolder extends RecyclerView.ViewHolder {
        private final TextView tvName;
        private final TextView tvCompany;
        private final TextView tvManager;
        private final TextView tvStatus;
        private final TextView tvDate;
        private final ImageView ivMore;

        public ViewHolder(@NonNull View itemView) {
            super(itemView);
            tvName = itemView.findViewById(R.id.tv_name);
            tvCompany = itemView.findViewById(R.id.tv_company);
            tvManager = itemView.findViewById(R.id.tv_manager);
            tvStatus = itemView.findViewById(R.id.tv_status);
            tvDate = itemView.findViewById(R.id.tv_date);
            ivMore = itemView.findViewById(R.id.iv_more);
        }

        public void bind(Project project) {
            tvName.setText(project.getName());
            tvCompany.setText(project.getCompany() + " | " + project.getTeam());
            tvManager.setText("负责人: " + project.getManager() + " " + project.getManagerPhone());
            tvStatus.setText(project.getStatusText());
            tvStatus.setTextColor(project.getStatusColor());
            tvDate.setText("开工: " + project.getStartDate());
            
            // 点击更多
            ivMore.setOnClickListener(v -> {
                PopupMenu popup = new PopupMenu(itemView.getContext(), ivMore);
                popup.getMenuInflater().inflate(R.menu.menu_project_item, popup.getMenu());
                popup.setOnMenuItemClickListener(item -> {
                    int id = item.getItemId();
                    if (id == R.id.action_view) {
                        listener.onViewDetail(project);
                        return true;
                    } else if (id == R.id.action_edit) {
                        listener.onEdit(project);
                        return true;
                    } else if (id == R.id.action_delete) {
                        listener.onDelete(project);
                        return true;
                    }
                    return false;
                });
                popup.show();
            });
            
            // 点击整行查看详情
            itemView.setOnClickListener(v -> listener.onViewDetail(project));
        }
    }
}
