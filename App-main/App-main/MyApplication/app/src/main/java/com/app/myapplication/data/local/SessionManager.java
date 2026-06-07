package com.app.myapplication.data.local;

import android.content.Context;
import android.content.SharedPreferences;

import com.app.myapplication.data.model.LoginResult;

public class SessionManager {

//    保存/读取登录 token、登录状态等

    private static final String SP = "session_sp";
    private static final String K_TOKEN = "token";
    private static final String K_REFRESH = "refresh_token";
    private static final String K_EXPIRES = "expires_at";
    private static final String K_USER_ID = "user_id";
    private static final String K_NICK = "nickname";
    private static final String K_AVATAR = "avatar_url";

    private final SharedPreferences sp;

    public SessionManager(Context ctx) {
        sp = ctx.getSharedPreferences(SP, Context.MODE_PRIVATE);
    }

    public boolean hasToken() {
        String t = sp.getString(K_TOKEN, "");
        return t != null && !t.isEmpty();
    }

    public String getToken() {
        return sp.getString(K_TOKEN, "");
    }

    public String getUserId() {
        return sp.getString(K_USER_ID, "");
    }

    public String getNickname() {
        return sp.getString(K_NICK, "");
    }

    public void saveSession(LoginResult r) {
        sp.edit()
                .putString(K_TOKEN, r.token)
                .putString(K_REFRESH, r.refreshToken)
                .putLong(K_EXPIRES, r.expiresAt)
                .putString(K_USER_ID, r.userId)
                .putString(K_NICK, r.nickname)
                .putString(K_AVATAR, r.avatarUrl)
                .apply();
    }

    public void saveTestUser(String userId, String nickname) {
        sp.edit()
                .putString(K_TOKEN, "test_voice_call")
                .putString(K_REFRESH, "")
                .putLong(K_EXPIRES, 0L)
                .putString(K_USER_ID, userId)
                .putString(K_NICK, nickname)
                .putString(K_AVATAR, "")
                .apply();
    }

    public void clear() {
        sp.edit().clear().apply();
    }
}

