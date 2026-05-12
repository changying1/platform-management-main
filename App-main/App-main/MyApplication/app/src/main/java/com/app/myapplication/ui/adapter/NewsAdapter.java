package com.app.myapplication.ui.adapter;

import android.graphics.Color;
import android.graphics.drawable.Drawable;
import android.os.Build;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.TextView;

import androidx.annotation.ColorInt;
import androidx.annotation.NonNull;
import androidx.core.graphics.drawable.DrawableCompat;
import androidx.recyclerview.widget.RecyclerView;

import com.app.myapplication.R;

import java.util.List;

public class NewsAdapter extends RecyclerView.Adapter<NewsAdapter.VH> {

    /** ✅ 新闻数据结构：更丰富（tag + title + desc + time + color） */
    public static class NewsItem {
        public final String tag;     // 公告/维护/紧急/提醒...
        public final String title;   // 标题（第一行）
        public final String desc;    // 摘要（第二行）
        public final String time;    // 右侧时间
        public final @ColorInt int color; // 左侧点颜色（分类色）

        public NewsItem(String tag, String title, String desc, String time, @ColorInt int color) {
            this.tag = tag;
            this.title = title;
            this.desc = desc;
            this.time = time;
            this.color = color;
        }
    }

    public interface OnClick {
        void onClick(NewsItem item);
    }

    private final List<NewsItem> list;
    private final OnClick onClick;

    public NewsAdapter(List<NewsItem> list, OnClick onClick) {
        this.list = list;
        this.onClick = onClick;
    }

    @NonNull
    @Override
    public VH onCreateViewHolder(@NonNull ViewGroup parent, int viewType) {
        View v = LayoutInflater.from(parent.getContext()).inflate(R.layout.item_news_row, parent, false);
        return new VH(v);
    }

    @Override
    public void onBindViewHolder(@NonNull VH holder, int position) {
        NewsItem item = list.get(position);

        holder.tvTag.setText(item.tag);
        holder.tvTitle.setText(item.title);
        holder.tvDesc.setText(item.desc);
        holder.tvTime.setText(item.time);

        // ✅ 左侧彩色点：保持圆角 shape，同时改颜色（推荐做法：tint）
        tintBackground(holder.vDot, item.color);

        // ✅ tag 文字色：跟分类走（更像设计）
        holder.tvTag.setTextColor(tagTextColor(item.tag));

        // ✅ tag 背景：统一浅底，避免花（可选：你也可以按类型换底色）
        // holder.tvTag.setBackgroundResource(R.drawable.bg_news_tag);

        holder.itemView.setOnClickListener(v -> {
            if (onClick != null) onClick.onClick(item);
        });
    }

    @Override
    public int getItemCount() {
        return list == null ? 0 : list.size();
    }

    /** 根据 tag 返回文字色（你可自由调整） */
    private @ColorInt int tagTextColor(String tag) {
        if ("维护".equals(tag)) return Color.parseColor("#7B61FF"); // 紫
        if ("紧急".equals(tag)) return Color.parseColor("#FF4D4F"); // 红
        if ("提醒".equals(tag)) return Color.parseColor("#F59E0B"); // 橙
        // 默认公告蓝
        return Color.parseColor("#2563EB");
    }

    /** 给 View 的背景上色（保留 shape 圆角），兼容性更好 */
    private void tintBackground(View view, @ColorInt int color) {
        Drawable bg = view.getBackground();
        if (bg == null) {
            view.setBackgroundColor(color);
            return;
        }
        Drawable wrapped = DrawableCompat.wrap(bg.mutate());
        DrawableCompat.setTint(wrapped, color);
        view.setBackground(wrapped);
    }

    static class VH extends RecyclerView.ViewHolder {
        View vDot;
        TextView tvTag, tvTitle, tvDesc, tvTime;

        VH(@NonNull View itemView) {
            super(itemView);
            vDot = itemView.findViewById(R.id.vDot);
            tvTag = itemView.findViewById(R.id.tvTag);
            tvTitle = itemView.findViewById(R.id.tvTitle);
            tvDesc = itemView.findViewById(R.id.tvDesc);
            tvTime = itemView.findViewById(R.id.tvTime);
        }
    }
}
