package com.app.myapplication.ui;

import android.os.Bundle;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.ImageView;
import android.widget.TextView;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.fragment.app.Fragment;
import androidx.lifecycle.ViewModelProvider;

import com.app.myapplication.R;
import com.app.myapplication.viewmodel.MeViewModel;

public class MeFragment extends Fragment {

    private ImageView ivAvatar;
    private TextView tvName;

    @Nullable
    @Override
    public View onCreateView(@NonNull LayoutInflater inflater,
                             @Nullable ViewGroup container,
                             @Nullable Bundle savedInstanceState) {
        View v = inflater.inflate(R.layout.fragment_me, container, false);
        ivAvatar = v.findViewById(R.id.iv_avatar);
        tvName = v.findViewById(R.id.tv_name);
        return v;
    }

    @Override
    public void onViewCreated(@NonNull View view, @Nullable Bundle savedInstanceState) {
        super.onViewCreated(view, savedInstanceState);

        MeViewModel vm = new ViewModelProvider(this).get(MeViewModel.class);
        vm.getProfile().observe(getViewLifecycleOwner(), profile -> {
            tvName.setText(profile.name);

            // 先用默认头像（本地圆形背景+图标）
            // 如果你以后要加载 avatarUrl，我再帮你加 Glide
        });
    }
}
