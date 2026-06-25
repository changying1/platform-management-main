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

        SessionManager session = new SessionManager(requireContext());
        String displayName = firstNonEmpty(session.getFullName(), session.getNickname(), session.getUsername());
        if (displayName == null || displayName.trim().isEmpty()) {
            displayName = session.getUsername();
        }
        tvName.setText(displayName == null || displayName.trim().isEmpty() ? "未登录" : displayName);
        tvSub.setText(buildProfileSubtitle(session));

        btnLogout.setOnClickListener(v -> {
            session.clear();
            ApiClient.reset();

            Intent intent = new Intent(requireContext(), LoginActivity.class);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TASK);
            startActivity(intent);
            requireActivity().finish();
        });
    }

    private String buildProfileSubtitle(SessionManager session) {
        String username = session.getUsername();
        String roleLabel = roleLabel(firstNonEmpty(session.getPermissionLevel(), session.getRole()));
        String organization = joinNonEmpty(" / ", session.getCompany(), session.getProject(), session.getTeam());

        StringBuilder builder = new StringBuilder();
        if (!isBlank(username)) {
            builder.append(username);
        }
        if (!isBlank(roleLabel)) {
            if (builder.length() > 0) builder.append('\n');
            builder.append(roleLabel);
        }
        if (!isBlank(organization)) {
            if (builder.length() > 0) builder.append('\n');
            builder.append(organization);
        }
        if (builder.length() == 0) {
            builder.append("未登录");
        }
        return builder.toString();
    }

    private String roleLabel(String role) {
        if (role == null) return "";
        switch (role) {
            case "headquarters_admin":
            case "HQ":
            case "ADMIN":
                return "系统总管理员";
            case "branch_admin":
            case "BRANCH":
                return "分公司管理员";
            case "project_safety_admin":
            case "PROJECT":
                return "项目管理员";
            case "grid_admin":
            case "GRID":
                return "网格管理员";
            case "team_admin":
            case "TEAM":
                return "工队管理员";
            default:
                return role;
        }
    }

    private String firstNonEmpty(String... values) {
        if (values == null) return "";
        for (String value : values) {
            if (!isBlank(value)) return value.trim();
        }
        return "";
    }

    private String joinNonEmpty(String separator, String... values) {
        StringBuilder builder = new StringBuilder();
        if (values == null) return "";
        for (String value : values) {
            if (isBlank(value)) continue;
            if (builder.length() > 0) builder.append(separator);
            builder.append(value.trim());
        }
        return builder.toString();
    }

    private boolean isBlank(String value) {
        return value == null || value.trim().isEmpty();
    }
}
