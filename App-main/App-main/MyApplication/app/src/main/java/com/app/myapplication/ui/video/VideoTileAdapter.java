package com.app.myapplication.ui.video;

import android.graphics.Color;
import android.text.TextUtils;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.FrameLayout;
import android.widget.TextView;

import androidx.annotation.NonNull;
import androidx.recyclerview.widget.RecyclerView;

import com.app.myapplication.R;
import com.app.myapplication.data.model.VideoDevice;
import com.google.android.material.card.MaterialCardView;

import java.util.ArrayList;
import java.util.List;

public class VideoTileAdapter extends RecyclerView.Adapter<VideoTileAdapter.VH> {

    // 展示“当前页”的设备 tile，点击进入播放页
    public interface Listener { void onClick(VideoDevice item); }

    private final Listener listener;
    private final List<VideoDevice> data = new ArrayList<>();

    /** 每页格数（决定 >9 时隐藏文字） */
    private int gridMode = 4;
    private int spanCount = 2;

    public void setSpanCount(int span) {
        this.spanCount = Math.max(1, span);
        notifyDataSetChanged();
    }

    public VideoTileAdapter(Listener l) {
        listener = l;
        setHasStableIds(true);
    }

    public void setData(List<VideoDevice> d) {
        data.clear();
        if (d != null) data.addAll(d);
        notifyDataSetChanged();
    }

    @Override
    public long getItemId(int position) {
        VideoDevice item = data.get(position);
        Integer id = item == null ? null : item.getId();
        return id == null ? RecyclerView.NO_ID : id.hashCode();
    }

    @NonNull @Override
    public VH onCreateViewHolder(@NonNull ViewGroup parent, int viewType) {
        View v = LayoutInflater.from(parent.getContext())
                .inflate(R.layout.item_video_tile, parent, false);
        return new VH(v);
    }



    @Override public void onBindViewHolder(@NonNull VH h, int pos) {

        androidx.constraintlayout.widget.ConstraintLayout.LayoutParams lp =
                (androidx.constraintlayout.widget.ConstraintLayout.LayoutParams)
                        h.videoContainer.getLayoutParams();

        h.videoContainer.setLayoutParams(lp);

        VideoDevice item = data.get(pos);
        if (item == null) return;

        // 只保留标题（sub 已删除）
        String title = firstNonEmpty(item.getName(), item.getId(), item.getStreamUrl());
        h.tvTitle.setText(title);
        h.tvStatus.setText(VideoDeviceStatus.label(item));

        if (item.isFrontendOnly()) {
            h.card.setCardBackgroundColor(Color.BLACK);
            h.videoContainer.setBackgroundColor(Color.BLACK);
            h.tvNoSignal.setVisibility(View.VISIBLE);
            h.tvTitle.setTextColor(Color.WHITE);
            h.tvStatus.setTextColor(Color.WHITE);
        } else {
            h.card.setCardBackgroundColor(Color.parseColor("#B6E3FA"));
            h.videoContainer.setBackgroundColor(Color.parseColor("#EFEFF4"));
            h.tvNoSignal.setVisibility(View.GONE);
            h.tvTitle.setTextColor(Color.parseColor("#0B1220"));
            h.tvStatus.setTextColor(Color.parseColor("#475467"));
        }

        // ✅ 超过9格：隐藏标题区域（只留视频/占位区域），避免字变形
        if (gridMode > 9) {
            h.tvTitle.setVisibility(View.GONE);
            h.tvStatus.setVisibility(View.GONE);
        } else {
            h.tvTitle.setVisibility(View.VISIBLE);
            h.tvStatus.setVisibility(View.VISIBLE);

            // ✅ 防止 “De\nvice” 断行变形：单行 + 省略号（XML 也建议写）
            h.tvTitle.setSingleLine(true);
            h.tvTitle.setEllipsize(android.text.TextUtils.TruncateAt.END);
        }

        h.itemView.setOnClickListener(v -> {
            if (listener != null) listener.onClick(item);
        });
    }

    @Override public int getItemCount() { return data.size(); }

    static class VH extends RecyclerView.ViewHolder {
        MaterialCardView card;
        FrameLayout videoContainer;
        TextView tvTitle, tvStatus, tvNoSignal;
        VH(@NonNull View itemView) {
            super(itemView);
            card = itemView.findViewById(R.id.card);
            tvTitle = itemView.findViewById(R.id.tv_title);
            tvStatus = itemView.findViewById(R.id.tv_status);
            tvNoSignal = itemView.findViewById(R.id.tv_no_signal);
            videoContainer = itemView.findViewById(R.id.video_container);
        }
    }

    private String firstNonEmpty(Object... values) {
        for (Object v : values) {
            if (v == null) continue;
            String s = String.valueOf(v).trim();
            if (!s.isEmpty() && !"null".equalsIgnoreCase(s)) return s;
        }
        return "";
    }
}
