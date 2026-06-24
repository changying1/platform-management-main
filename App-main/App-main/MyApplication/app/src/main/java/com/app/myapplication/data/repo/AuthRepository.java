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

    public interface SessionCallback {
        void onValid();
        void onInvalid();
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

    public void validateSession(SessionCallback cb) {
        if (!session.hasToken()) {
            cb.onInvalid();
            return;
        }

        AuthApi api = ApiClient.get(context).create(AuthApi.class);
        api.me().enqueue(new retrofit2.Callback<LoginResult>() {
            @Override
            public void onResponse(Call<LoginResult> call, Response<LoginResult> response) {
                if (response.isSuccessful() && response.body() != null) {
                    cb.onValid();
                    return;
                }
                session.clear();
                ApiClient.reset();
                cb.onInvalid();
            }

            @Override
            public void onFailure(Call<LoginResult> call, Throwable t) {
                session.clear();
                ApiClient.reset();
                cb.onInvalid();
            }
        });
    }

    public void login(String username, String password, Callback cb) {
        String account = username == null || username.trim().isEmpty() ? "" : username.trim();
        String pwd = password == null ? "" : password;
        AuthApi api = ApiClient.get(context).create(AuthApi.class);
        api.login(new AuthApi.LoginRequest(account, pwd)).enqueue(new retrofit2.Callback<LoginResult>() {
            @Override
            public void onResponse(Call<LoginResult> call, Response<LoginResult> response) {
                LoginResult result = response.body();
                if (!response.isSuccessful() || result == null || result.token == null || result.token.trim().isEmpty()) {
                    cb.onError("登录失败: HTTP " + response.code());
                    return;
                }
                if (result.nickname == null || result.nickname.trim().isEmpty()) {
                    if (result.fullName != null && !result.fullName.trim().isEmpty()) {
                        result.nickname = result.fullName.trim();
                    } else if (result.username != null && !result.username.trim().isEmpty()) {
                        result.nickname = result.username.trim();
                    } else {
                        result.nickname = account;
                    }
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
