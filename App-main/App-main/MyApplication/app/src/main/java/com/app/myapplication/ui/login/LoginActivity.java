package com.app.myapplication.ui.login;

import android.content.Intent;
import android.os.Bundle;
import android.text.TextUtils;
import android.view.View;
import android.widget.Button;
import android.widget.EditText;
import android.widget.ProgressBar;
import android.widget.TextView;

import androidx.appcompat.app.AppCompatActivity;
import androidx.lifecycle.ViewModelProvider;

import com.app.myapplication.R;
import com.app.myapplication.ui.MainActivity;
import com.app.myapplication.viewmodel.login.LoginViewModel;

public class LoginActivity extends AppCompatActivity {

    private LoginViewModel vm;

    private EditText etUsername;
    private Button btnLogin;

    // 你布局里旧的 progress（在 card 内，会挤布局）
    private ProgressBar progress;
    private TextView tvError;

    // ✅ 覆盖层 loading（你 XML 里新增的）
    private View loadingOverlay;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // ⚠️ 你现在每次启动都 clear，会导致永远重新登录（按需保留）
        new com.app.myapplication.data.local.SessionManager(this).clear();

        vm = new ViewModelProvider(this).get(LoginViewModel.class);

        // 已登录直接进首页
        if (vm.isLoggedIn()) {
            goHome();
            return;
        }

        setContentView(R.layout.activity_login);

        etUsername = findViewById(R.id.et_username);
        btnLogin = findViewById(R.id.btn_login);
        progress = findViewById(R.id.progress);
        tvError = findViewById(R.id.tv_error);
        loadingOverlay = findViewById(R.id.loading_overlay); // ✅

        // ✅ 强制确保旧 progress 不参与显示（避免布局跳动）
        if (progress != null) progress.setVisibility(View.GONE);

        vm.getUiState().observe(this, state -> {
            // ✅ 用覆盖层，不挤布局
            setLoading(state.loading);

            // 错误展示
            boolean hasError = !TextUtils.isEmpty(state.error);
            tvError.setVisibility(hasError ? View.VISIBLE : View.GONE);
            tvError.setText(hasError ? state.error : "");

            if (state.success) {
                goHome();
            }
        });

        btnLogin.setOnClickListener(v -> {
            // 防重复点击（如果正在loading就不再触发）
            if (loadingOverlay != null && loadingOverlay.getVisibility() == View.VISIBLE) return;

            String username = etUsername.getText().toString().trim();
            if (TextUtils.isEmpty(username)) username = "游客";

            vm.loginNoPassword(username);
        });
    }

    private void setLoading(boolean loading) {
        // ✅ 覆盖式loading：不撑布局
        if (loadingOverlay != null) {
            loadingOverlay.setVisibility(loading ? View.VISIBLE : View.GONE);
            if (loading) {
                // 保险：确保它在最上面
                loadingOverlay.bringToFront();
                loadingOverlay.invalidate();
            }
        }

        // ✅ 旧 progress 永远隐藏，避免撑高卡片
        if (progress != null) progress.setVisibility(View.GONE);

        // ✅ loading 时禁用输入/按钮
        btnLogin.setEnabled(!loading);
        etUsername.setEnabled(!loading);
    }

    private void goHome() {
        Intent i = new Intent(this, MainActivity.class);
        startActivity(i);
        finish();
    }
}
