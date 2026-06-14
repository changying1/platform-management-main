package com.app.myapplication.ui.settings;

import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.AdapterView;
import android.widget.ArrayAdapter;
import android.widget.Spinner;
import android.widget.TextView;

import androidx.annotation.NonNull;
import androidx.recyclerview.widget.RecyclerView;

import com.app.myapplication.R;
import com.app.myapplication.data.model.AIAlgorithmConfig;

import java.util.ArrayList;
import java.util.List;

public class AIAlgorithmAdapter extends RecyclerView.Adapter<AIAlgorithmAdapter.ViewHolder> {

    private List<AIAlgorithmConfig> algorithmList = new ArrayList<>();

    public AIAlgorithmAdapter() {
        this.algorithmList = new ArrayList<>();
    }

    public void submitList(List<AIAlgorithmConfig> list) {
        this.algorithmList = list != null ? new ArrayList<>(list) : new ArrayList<>();
        notifyDataSetChanged();
    }

    @NonNull
    @Override
    public ViewHolder onCreateViewHolder(@NonNull ViewGroup parent, int viewType) {
        View view = LayoutInflater.from(parent.getContext())
                .inflate(R.layout.item_ai_algorithm, parent, false);
        return new ViewHolder(view);
    }

    @Override
    public void onBindViewHolder(@NonNull ViewHolder holder, int position) {
        AIAlgorithmConfig config = algorithmList.get(position);
        holder.tvName.setText(config.getName());
        holder.tvCategory.setText(config.getCategory());
        holder.tvDescription.setText(config.getDescription());

        // 设置级别选择
        String[] levels = {"高危", "警告", "提示"};
        ArrayAdapter<String> adapter = new ArrayAdapter<>(holder.itemView.getContext(),
                android.R.layout.simple_spinner_item, levels);
        adapter.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item);
        holder.spinnerLevel.setAdapter(adapter);

        // 设置当前级别
        String currentLevel = config.getLevel();
        int levelIndex = 0;
        if ("medium".equals(currentLevel)) levelIndex = 1;
        else if ("low".equals(currentLevel)) levelIndex = 2;
        holder.spinnerLevel.setSelection(levelIndex);

        // 级别变化监听
        holder.spinnerLevel.setOnItemSelectedListener(new AdapterView.OnItemSelectedListener() {
            @Override
            public void onItemSelected(AdapterView<?> parent, View view, int position, long id) {
                String newLevel = "high";
                if (position == 1) newLevel = "medium";
                else if (position == 2) newLevel = "low";
                config.setLevel(newLevel);
            }

            @Override
            public void onNothingSelected(AdapterView<?> parent) {}
        });

        // 设置级别颜色
        int color;
        switch (config.getLevel()) {
            case "high":
                color = 0xFFD32F2F; // 红色
                break;
            case "medium":
                color = 0xFFF57C00; // 橙色
                break;
            default:
                color = 0xFF388E3C; // 绿色
        }
        holder.tvLevelIndicator.setBackgroundColor(color);
    }

    @Override
    public int getItemCount() {
        return algorithmList.size();
    }

    public List<AIAlgorithmConfig> getAlgorithmList() {
        return algorithmList;
    }

    static class ViewHolder extends RecyclerView.ViewHolder {
        TextView tvName, tvCategory, tvDescription, tvLevelIndicator;
        Spinner spinnerLevel;

        ViewHolder(View itemView) {
            super(itemView);
            tvName = itemView.findViewById(R.id.tvAlgoName);
            tvCategory = itemView.findViewById(R.id.tvAlgoCategory);
            tvDescription = itemView.findViewById(R.id.tvAlgoDescription);
            tvLevelIndicator = itemView.findViewById(R.id.tvLevelIndicator);
            spinnerLevel = itemView.findViewById(R.id.spinnerAlgoLevel);
        }
    }
}
