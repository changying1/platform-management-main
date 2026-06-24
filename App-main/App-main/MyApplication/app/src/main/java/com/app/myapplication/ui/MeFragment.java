package com.app.myapplication.ui;

import android.content.Intent;
import android.os.Bundle;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.ImageView;
import android.widget.TextView;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.fragment.app.Fragment;

import com.app.myapplication.R;
import com.app.myapplication.data.api.ApiClient;
import com.app.myapplication.data.local.SessionManager;
import com.app.myapplication.ui.call.AppVoiceCallInviteService;
import com.app.myapplication.ui.login.LoginActivity;

public class MeFragment extends Fragment {

    private ImageView ivAvatar;
    private TextView tvName;
    private TextView tvSub;
    private Button btnLogout;

    @Nullable
    @Override
    public View onCreateView(@NonNull LayoutInflater inflater,
                             @Nullable ViewGroup container,
                             @Nullable Bundle savedInstanceState) {
        View v = inflater.inflate(R.layout.fragment_me, container, false);
        ivAvatar = v.findViewById(R.id.iv_avatar);
        tvName = v.findViewById(R.id.tv_name);
        tvSub = v.findViewById(R.id.tv_sub);
        btnLogout = v.findViewById(R.id.btn_logout);
        return v;
    }

    @Override
    public void onViewCreated(@NonNull View view, @Nullable Bundle savedInstanceState) {
        super.onViewCreated(view, savedInstanceState);

        bindSessionProfile();

            // 先用默认头像（本地圆形背景+图标）
            // 如果你以后要加载 avatarUrl，我再帮你加 Glide
        btnLogout.setOnClickListener(v -> {
            AppVoiceCallInviteService.stop(requireContext());
            new SessionManager(requireContext()).clear();
            ApiClient.reset();
            Intent intent = new Intent(requireContext(), LoginActivity.class);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TASK);
            startActivity(intent);
            requireActivity().finish();
        });
    }

    private void bindSessionProfile() {
        SessionManager session = new SessionManager(requireContext());
        String name = session.getNickname();
        if (name == null || name.trim().isEmpty()) {
            name = session.getUsername();
        }
        if (name == null || name.trim().isEmpty()) {
            name = session.getUserId();
        }
        tvName.setText((name == null || name.trim().isEmpty()) ? "未登录" : name.trim());

        String role = session.getRole();
        String permissionLevel = session.getPermissionLevel();
        String label = (role == null || role.trim().isEmpty()) ? "用户" : role.trim();
        if (permissionLevel != null && !permissionLevel.trim().isEmpty()) {
            label += " · " + permissionLevel.trim();
        }
        tvSub.setText(label + " · 在线");
    }
}
