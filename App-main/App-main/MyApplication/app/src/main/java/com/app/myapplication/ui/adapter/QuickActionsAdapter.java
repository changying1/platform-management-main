package com.app.myapplication.ui.adapter;

import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.ImageView;
import android.widget.TextView;

import androidx.annotation.NonNull;
import androidx.recyclerview.widget.RecyclerView;

import com.app.myapplication.R;

import java.util.List;

public class QuickActionsAdapter extends RecyclerView.Adapter<QuickActionsAdapter.VH> {

    public static class Item {
        public final String title;
        public final int iconRes;
        public Item(String title, int iconRes) {
            this.title = title;
            this.iconRes = iconRes;
        }
    }

    public interface OnClick {
        void onClick(Item item);
    }

    private final List<Item> list;
    private final OnClick onClick;

    public QuickActionsAdapter(List<Item> list, OnClick onClick) {
        this.list = list;
        this.onClick = onClick;
    }

    @NonNull @Override
    public VH onCreateViewHolder(@NonNull ViewGroup parent, int viewType) {
        View v = LayoutInflater.from(parent.getContext()).inflate(R.layout.item_quick_action, parent, false);
        return new VH(v);
    }

    @Override
    public void onBindViewHolder(@NonNull VH holder, int position) {
        Item item = list.get(position);
        holder.tv.setText(item.title);
        holder.img.setImageResource(item.iconRes);

        holder.itemView.setOnClickListener(v -> {
            if (onClick != null) onClick.onClick(item);
        });
    }

    @Override
    public int getItemCount() { return list == null ? 0 : list.size(); }

    static class VH extends RecyclerView.ViewHolder {
        ImageView img;
        TextView tv;
        VH(@NonNull View itemView) {
            super(itemView);
            img = itemView.findViewById(R.id.imgQuick);
            tv = itemView.findViewById(R.id.tvQuick);
        }
    }
}
