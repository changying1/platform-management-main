package com.app.myapplication.ui.management.adapter;

import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.TextView;

import androidx.annotation.NonNull;
import androidx.recyclerview.widget.RecyclerView;

import com.app.myapplication.R;
import com.app.myapplication.data.model.Team;

import java.util.List;

/**
 * 工队列表适配器
 */
public class TeamAdapter extends RecyclerView.Adapter<TeamAdapter.ViewHolder> {

    private List<Team> teams;

    public TeamAdapter(List<Team> teams) {
        this.teams = teams;
    }

    @NonNull
    @Override
    public ViewHolder onCreateViewHolder(@NonNull ViewGroup parent, int viewType) {
        View view = LayoutInflater.from(parent.getContext())
                .inflate(R.layout.item_team, parent, false);
        return new ViewHolder(view);
    }

    @Override
    public void onBindViewHolder(@NonNull ViewHolder holder, int position) {
        Team team = teams.get(position);
        holder.bind(team);
    }

    @Override
    public int getItemCount() {
        return teams.size();
    }

    static class ViewHolder extends RecyclerView.ViewHolder {
        private final View colorIndicator;
        private final TextView tvTeamId;
        private final TextView tvName;
        private final TextView tvProject;
        private final TextView tvCompany;
        private final TextView tvFenceCount;

        public ViewHolder(@NonNull View itemView) {
            super(itemView);
            colorIndicator = itemView.findViewById(R.id.color_indicator);
            tvTeamId = itemView.findViewById(R.id.tv_team_id);
            tvName = itemView.findViewById(R.id.tv_name);
            tvProject = itemView.findViewById(R.id.tv_project);
            tvCompany = itemView.findViewById(R.id.tv_company);
            tvFenceCount = itemView.findViewById(R.id.tv_fence_count);
        }

        public void bind(Team team) {
            colorIndicator.setBackgroundColor(team.getColorValue());
            tvTeamId.setText(team.getTeamId());
            tvName.setText(team.getName());
            tvProject.setText("项目: " + team.getProject());
            tvCompany.setText("公司: " + team.getCompany());
            tvFenceCount.setText("关联围栏: " + team.getFenceCount());
        }
    }
}
