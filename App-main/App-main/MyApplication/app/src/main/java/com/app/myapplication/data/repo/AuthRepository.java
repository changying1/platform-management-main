package com.app.myapplication.data.repo;

import android.content.Context;
import android.os.Handler;
import android.os.Looper;

import com.app.myapplication.data.local.SessionManager;
import com.app.myapplication.data.model.LoginResult;

import java.util.UUID;

public class AuthRepository {

    public interface Callback {
        void onSuccess(LoginResult result);
        void onError(String msg);
    }

    private final SessionManager session;

    public AuthRepository(Context context) {
        session = new SessionManager(context);
    }

    public boolean isLoggedIn() {
        return session.hasToken();
    }

    // ✅ 现在：假装调用后端（延迟 400ms），生成 token，保存会话
    // ✅ 以后：把这段替换成真实网络请求（Retrofit/OkHttp），返回后端 token
    public void loginNoPassword(String username, Callback cb) {
        new Handler(Looper.getMainLooper()).postDelayed(() -> {
            // 模拟后端返回
            String token = "mock_" + UUID.randomUUID();
            String userId = "u_" + UUID.randomUUID().toString().substring(0, 8);

            LoginResult result = new LoginResult();
            result.token = token;
            result.refreshToken = "";     // 以后后端若有 refreshToken 就填
            result.expiresAt = 0L;        // 以后后端若返回过期时间就填（毫秒时间戳）
            result.userId = userId;
            result.nickname = username;
            result.avatarUrl = "";        // 以后后端返回头像 URL

            session.saveSession(result);
            cb.onSuccess(result);
        }, 400);
    }

    public void logout() {
        session.clear();
    }
}

