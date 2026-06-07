package com.app.myapplication.ui.management.fragment;

import android.os.Bundle;
import android.view.View;
import android.widget.Toast;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.fragment.app.Fragment;
import androidx.recyclerview.widget.LinearLayoutManager;
import androidx.recyclerview.widget.RecyclerView;
import androidx.swiperefreshlayout.widget.SwipeRefreshLayout;

import com.app.myapplication.data.api.ApiClient;
import com.app.myapplication.data.api.ManagementApi;
import com.app.myapplication.data.local.SessionManager;

import java.util.HashMap;
import java.util.Map;

/**
 * 管理页面基类
 */
public abstract class BaseManagementFragment extends Fragment {

    protected ManagementApi managementApi;
    protected SessionManager sessionManager;
    protected SwipeRefreshLayout swipeRefreshLayout;

    @Override
    public void onCreate(@Nullable Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        managementApi = ApiClient.get(requireContext()).create(ManagementApi.class);
        sessionManager = new SessionManager(requireContext());
    }

    /**
     * 设置下拉刷新
     */
    protected void setupSwipeRefresh(View view, int swipeRefreshId, Runnable onRefresh) {
        swipeRefreshLayout = view.findViewById(swipeRefreshId);
        if (swipeRefreshLayout != null) {
            swipeRefreshLayout.setColorSchemeResources(
                android.R.color.holo_blue_bright,
                android.R.color.holo_green_light,
                android.R.color.holo_orange_light
            );
            swipeRefreshLayout.setOnRefreshListener(() -> {
                onRefresh.run();
                swipeRefreshLayout.setRefreshing(false);
            });
        }
    }

    /**
     * 显示加载中
     */
    protected void showLoading() {
        if (swipeRefreshLayout != null) {
            swipeRefreshLayout.setRefreshing(true);
        }
    }

    /**
     * 隐藏加载中
     */
    protected void hideLoading() {
        if (swipeRefreshLayout != null) {
            swipeRefreshLayout.setRefreshing(false);
        }
    }

    /**
     * 显示 Toast
     */
    protected void showToast(String message) {
        Toast.makeText(requireContext(), message, Toast.LENGTH_SHORT).show();
    }

    /**
     * 获取认证 Header
     */
    protected Map<String, String> getAuthHeaders() {
        Map<String, String> headers = new HashMap<>();
        String token = sessionManager.getToken();
        if (token != null && !token.isEmpty()) {
            headers.put("X-Auth-Token", token);
            headers.put("Authorization", "Bearer " + token);
        }
        headers.put("X-Role", sessionManager.getRole());
        headers.put("X-Username", sessionManager.getUsername());
        headers.put("X-Permission-Level", sessionManager.getPermissionLevel());
        return headers;
    }

    /**
     * 检查权限
     */
    protected boolean hasPermission(String permissionCode) {
        return sessionManager.hasPermission(permissionCode);
    }
}
