package com.app.myapplication.ui;

import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.ImageView;
import android.widget.TextView;

import androidx.annotation.NonNull;
import androidx.recyclerview.widget.RecyclerView;

import com.app.myapplication.R;
import com.app.myapplication.ui.AppsFragment.AppEntry;

import java.util.List;

//把入口数据渲染成圆角卡片，并处理点击事件。
public class AppsEntryAdapter extends RecyclerView.Adapter<AppsEntryAdapter.VH> {

    public interface Listener {
        void onClick(AppEntry entry);
    }

    private final List<AppEntry> data;
    private final Listener listener;

    public AppsEntryAdapter(List<AppEntry> data, Listener listener) {
        this.data = data;
        this.listener = listener;
    }

    @NonNull
    @Override
    public VH onCreateViewHolder(@NonNull ViewGroup parent, int viewType) {
        View v = LayoutInflater.from(parent.getContext())
                .inflate(R.layout.item_app_entry, parent, false);
        return new VH(v);
    }

    @Override
    public void onBindViewHolder(@NonNull VH h, int position) {
        AppEntry item = data.get(position);

        h.tvTitle.setText(item.title);
        h.tvSubtitle.setText(item.subtitle);
        h.ivIcon.setImageResource(item.iconRes);

        // ✅ 背景颜色/渐变差异在这里控制
        if (h.vBg != null) h.vBg.setBackgroundResource(item.bgRes);
        // 点击卡片
        h.itemView.setOnClickListener(v -> listener.onClick(item));
    }

    @Override
    public int getItemCount() {
        return data == null ? 0 : data.size();
    }

    static class VH extends RecyclerView.ViewHolder {
        ImageView ivIcon;
        TextView tvTitle, tvSubtitle;
        View vBg; // ✅ 新增

        VH(@NonNull View itemView) {
            super(itemView);
            vBg = itemView.findViewById(R.id.v_bg); // ✅ 新增
            ivIcon = itemView.findViewById(R.id.iv_icon);
            tvTitle = itemView.findViewById(R.id.tv_title);
            tvSubtitle = itemView.findViewById(R.id.tv_subtitle);
        }
    }
}
