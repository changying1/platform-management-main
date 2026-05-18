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

public class BannerAdapter extends RecyclerView.Adapter<BannerAdapter.VH> {

    public static class BannerItem {
        public int imgRes;
        public String title;
        public String subTitle;

        public BannerItem(int imgRes, String title, String subTitle) {
            this.imgRes = imgRes;
            this.title = title;
            this.subTitle = subTitle;
        }
    }

    private final List<BannerItem> list;

    public BannerAdapter(List<BannerItem> list) {
        this.list = list;
    }

    @NonNull
    @Override
    public VH onCreateViewHolder(@NonNull ViewGroup parent, int viewType) {
        View v = LayoutInflater.from(parent.getContext()).inflate(R.layout.item_banner, parent, false);
        return new VH(v);
    }

    @Override
    public void onBindViewHolder(@NonNull VH holder, int position) {
        BannerItem item = list.get(position);
        holder.img.setImageResource(item.imgRes);
        holder.title.setText(item.title);
        holder.subTitle.setText(item.subTitle);
    }

    @Override
    public int getItemCount() {
        return list.size();
    }

    static class VH extends RecyclerView.ViewHolder {
        ImageView img;
        TextView title, subTitle;

        VH(@NonNull View itemView) {
            super(itemView);
            img = itemView.findViewById(R.id.imgBanner);
            title = itemView.findViewById(R.id.tvTitle);
            subTitle = itemView.findViewById(R.id.tvSubTitle);
        }
    }
}
