package com.app.myapplication.ui.management.adapter;

import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.TextView;

import androidx.annotation.NonNull;
import androidx.recyclerview.widget.RecyclerView;

import com.app.myapplication.R;
import com.app.myapplication.data.model.Grid;

import java.util.List;

/**
 * 网格列表适配器
 */
public class GridAdapter extends RecyclerView.Adapter<GridAdapter.ViewHolder> {

    private List<Grid> grids;

    public GridAdapter(List<Grid> grids) {
        this.grids = grids;
    }

    @NonNull
    @Override
    public ViewHolder onCreateViewHolder(@NonNull ViewGroup parent, int viewType) {
        View view = LayoutInflater.from(parent.getContext())
                .inflate(R.layout.item_grid, parent, false);
        return new ViewHolder(view);
    }

    @Override
    public void onBindViewHolder(@NonNull ViewHolder holder, int position) {
        Grid grid = grids.get(position);
        holder.bind(grid);
    }

    @Override
    public int getItemCount() {
        return grids.size();
    }

    static class ViewHolder extends RecyclerView.ViewHolder {
        private final TextView tvName;
        private final TextView tvProject;
        private final TextView tvCompany;
        private final TextView tvStatus;
        private final TextView tvStats;

        public ViewHolder(@NonNull View itemView) {
            super(itemView);
            tvName = itemView.findViewById(R.id.tv_name);
            tvProject = itemView.findViewById(R.id.tv_project);
            tvCompany = itemView.findViewById(R.id.tv_company);
            tvStatus = itemView.findViewById(R.id.tv_status);
            tvStats = itemView.findViewById(R.id.tv_stats);
        }

        public void bind(Grid grid) {
            tvName.setText(grid.getName());
            tvProject.setText("项目: " + grid.getProject());
            tvCompany.setText("公司: " + grid.getCompany());
            tvStatus.setText(grid.getStatusText());
            tvStats.setText(String.format("人员: %d | 设备: %d", 
                grid.getPersonnelCount(), grid.getDeviceCount()));
        }
    }
}
