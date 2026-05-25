package com.app.myapplication.ui.fence;

import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.ImageView;
import android.widget.TextView;

import androidx.annotation.NonNull;
import androidx.appcompat.widget.SwitchCompat;
import androidx.recyclerview.widget.RecyclerView;

import com.app.myapplication.R;
import com.app.myapplication.data.model.FenceItem;

import java.util.List;
import java.util.Locale;

/**
 * 围栏列表适配器 - 对齐后端新字段
 */
public class FenceAdapter extends RecyclerView.Adapter<FenceAdapter.VH> {

    public interface OnItemClick {
        void onClick(FenceItem fence);
    }

    public interface OnToggleEnable {
        void onToggle(FenceItem fence, boolean newEnabled);
    }

    public interface OnItemLongClick {
        void onLongClick(FenceItem fence);
    }

    private List<FenceItem> data;
    private final OnItemClick onItemClick;
    private final OnToggleEnable onToggleEnable;
    private final OnItemLongClick onItemLongClick;

    public FenceAdapter(List<FenceItem> data,
                        OnItemClick onItemClick,
                        OnToggleEnable onToggleEnable,
                        OnItemLongClick onItemLongClick) {
        this.data = data;
        this.onItemClick = onItemClick;
        this.onToggleEnable = onToggleEnable;
        this.onItemLongClick = onItemLongClick;
    }

    public void setData(List<FenceItem> data) {
        this.data = data;
        notifyDataSetChanged();
    }

    @NonNull
    @Override
    public VH onCreateViewHolder(@NonNull ViewGroup parent, int viewType) {
        View v = LayoutInflater.from(parent.getContext()).inflate(R.layout.item_fence, parent, false);
        return new VH(v);
    }

    @Override
    public void onBindViewHolder(@NonNull VH h, int position) {
        FenceItem f = data.get(position);

        // 名称
        String name = (f.name == null || f.name.trim().isEmpty()) ? "未命名围栏" : f.name.trim();
        h.tvName.setText(name);

        // 行为/规则 - 对齐后端 behavior: No Entry / No Exit
        String behavior = f.behavior == null ? "No Entry" : f.behavior;
        String triggerText = "No Exit".equalsIgnoreCase(behavior) ? "禁出" : "禁入";

        // 描述（圆/多边形）- 对齐后端 shape: circle / polygon
        String desc;
        if ("polygon".equalsIgnoreCase(f.shape)) {
            int n = (f.points == null) ? 0 : f.points.size();
            desc = String.format(Locale.getDefault(), "多边形 · 点数 %d · %s", n, triggerText);
        } else {
            double radius = (f.radius == null) ? 0.0 : f.radius;
            desc = String.format(Locale.getDefault(), "圆形 · 半径 %.0fm · %s", radius, triggerText);
        }
        h.tvDesc.setText(desc);

        // 开关 - 对齐后端 is_active: 0/1
        h.swEnable.setOnCheckedChangeListener(null);
        boolean enabled = (f.is_active != null && f.is_active == 1);
        h.swEnable.setChecked(enabled);

        h.swEnable.setOnCheckedChangeListener((buttonView, isChecked) -> {
            if (onToggleEnable != null) onToggleEnable.onToggle(f, isChecked);
        });

        // 点击
        h.itemView.setOnClickListener(v -> {
            if (onItemClick != null) onItemClick.onClick(f);
        });
        h.ivArrow.setOnClickListener(v -> {
            if (onItemClick != null) onItemClick.onClick(f);
        });

        // 长按
        h.itemView.setOnLongClickListener(v -> {
            if (onItemLongClick != null) onItemLongClick.onLongClick(f);
            return true;
        });
    }

    @Override
    public int getItemCount() {
        return data == null ? 0 : data.size();
    }

    static class VH extends RecyclerView.ViewHolder {
        TextView tvName, tvDesc;
        SwitchCompat swEnable;
        ImageView ivArrow;

        VH(@NonNull View itemView) {
            super(itemView);
            tvName = itemView.findViewById(R.id.tv_fence_name);
            tvDesc = itemView.findViewById(R.id.tv_fence_desc);
            swEnable = itemView.findViewById(R.id.sw_fence_enable);
            ivArrow = itemView.findViewById(R.id.iv_arrow);
        }
    }
}
