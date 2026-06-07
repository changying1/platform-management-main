package com.app.myapplication.data.repo;

import android.content.Context;

import com.app.myapplication.data.api.ApiClient;
import com.app.myapplication.data.api.AuthApi;
import com.app.myapplication.data.local.SessionManager;
import com.app.myapplication.data.model.LoginResult;

import retrofit2.Call;
import retrofit2.Response;

public class AuthRepository {

    public interface Callback {
        void onSuccess(LoginResult result);
        void onError(String msg);
    }

    private final Context context;
    private final SessionManager session;

    public AuthRepository(Context context) {
        this.context = context.getApplicationContext();
        session = new SessionManager(this.context);
    }

    public boolean isLoggedIn() {
        return session.hasToken();
    }

    public void loginNoPassword(String username, Callback cb) {
        String account = username == null || username.trim().isEmpty() ? "admin" : username.trim();
        AuthApi api = ApiClient.get(context).create(AuthApi.class);
        api.login(new AuthApi.LoginRequest(account, account)).enqueue(new retrofit2.Callback<LoginResult>() {
            @Override
            public void onResponse(Call<LoginResult> call, Response<LoginResult> response) {
                LoginResult result = response.body();
                if (!response.isSuccessful() || result == null || result.token == null || result.token.trim().isEmpty()) {
                    cb.onError("登录失败: HTTP " + response.code());
                    return;
                }
                if (result.nickname == null || result.nickname.trim().isEmpty()) {
                    result.nickname = account;
                }
                session.saveSession(result);
                ApiClient.reset();
                cb.onSuccess(result);
            }

            @Override
            public void onFailure(Call<LoginResult> call, Throwable t) {
                cb.onError("登录失败: " + (t.getMessage() == null ? "网络异常" : t.getMessage()));
            }
        });
    }

    public void logout() {
        session.clear();
    }
}
