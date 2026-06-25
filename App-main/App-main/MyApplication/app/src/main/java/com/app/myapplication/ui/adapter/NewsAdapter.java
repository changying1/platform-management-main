package com.app.myapplication.ui.adapter;

import android.graphics.Color;
import android.graphics.drawable.Drawable;
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

    public static class NewsItem {
        public final String tag;
        public final String title;
        public final String desc;
        public final String time;
        public final @ColorInt int color;

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
        holder.tvTag.setTextColor(tagTextColor(item.tag));
        tintBackground(holder.vDot, item.color);
        holder.itemView.setOnClickListener(v -> {
            if (onClick != null) onClick.onClick(item);
        });
    }

    @Override
    public int getItemCount() {
        return list == null ? 0 : list.size();
    }

    private @ColorInt int tagTextColor(String tag) {
        if ("\u7EF4\u62A4".equals(tag)) return Color.parseColor("#7B61FF");
        if ("\u7D27\u6025".equals(tag)) return Color.parseColor("#FF4D4F");
        if ("\u63D0\u9192".equals(tag)) return Color.parseColor("#F59E0B");
        if ("\u89C6\u9891".equals(tag)) return Color.parseColor("#FF4D4F");
        if ("\u56F4\u680F".equals(tag)) return Color.parseColor("#22C55E");
        return Color.parseColor("#2563EB");
    }

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
        final View vDot;
        final TextView tvTag;
        final TextView tvTitle;
        final TextView tvDesc;
        final TextView tvTime;

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
