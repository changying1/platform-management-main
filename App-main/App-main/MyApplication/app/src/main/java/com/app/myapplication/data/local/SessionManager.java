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
    private static final String K_ROLE = "role";
    private static final String K_PERMISSION_LEVEL = "permission_level";
    private static final String K_PERMISSIONS = "permissions";
    private static final String K_USERNAME = "username";
    private static final String K_FULL_NAME = "full_name";
    private static final String K_COMPANY = "company";
    private static final String K_PROJECT = "project";
    private static final String K_TEAM = "team";
    private static final String K_REMEMBER_ACCOUNT = "remember_account";
    private static final String K_REMEMBERED_USERNAME = "remembered_username";

    private final SharedPreferences sp;

    public SessionManager(Context ctx) {
        sp = ctx.getSharedPreferences(SP, Context.MODE_PRIVATE);
    }

    /**
     * 静态方法获取 token
     */
    public static String getToken(Context ctx) {
        SharedPreferences prefs = ctx.getSharedPreferences(SP, Context.MODE_PRIVATE);
        return prefs.getString(K_TOKEN, "");
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

    public String getFullName() {
        return sp.getString(K_FULL_NAME, "");
    }

    public String getCompany() {
        return sp.getString(K_COMPANY, "");
    }

    public String getProject() {
        return sp.getString(K_PROJECT, "");
    }

    public String getTeam() {
        return sp.getString(K_TEAM, "");
    }

    public void saveSession(LoginResult r) {
        String username = r.username == null ? "" : r.username;
        String displayName = r.nickname;
        if (displayName == null || displayName.trim().isEmpty()) {
            displayName = r.fullName;
        }
        if (displayName == null || displayName.trim().isEmpty()) {
            displayName = username;
        }

        sp.edit()
                .putString(K_TOKEN, r.token == null ? "" : r.token)
                .putString(K_REFRESH, r.refreshToken == null ? "" : r.refreshToken)
                .putLong(K_EXPIRES, r.expiresAt)
                .putString(K_USER_ID, r.userId == null ? "" : r.userId)
                .putString(K_NICK, displayName == null ? "" : displayName)
                .putString(K_USERNAME, username)
                .putString(K_FULL_NAME, r.fullName == null ? "" : r.fullName)
                .putString(K_AVATAR, r.avatarUrl == null ? "" : r.avatarUrl)
                .putString(K_ROLE, r.role == null ? "" : r.role)
                .putString(K_PERMISSION_LEVEL, r.permissionLevel == null ? "" : r.permissionLevel)
                .putString(K_COMPANY, r.company == null ? "" : r.company)
                .putString(K_PROJECT, r.project == null ? "" : r.project)
                .putString(K_TEAM, r.team == null ? "" : r.team)
                .putString(K_PERMISSIONS, r.permissions == null ? "" : String.join(",", r.permissions))
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
        boolean rememberAccount = isRememberAccount();
        String rememberedUsername = getRememberedUsername();
        SharedPreferences.Editor editor = sp.edit().clear();
        if (rememberAccount) {
            editor.putBoolean(K_REMEMBER_ACCOUNT, true)
                    .putString(K_REMEMBERED_USERNAME, rememberedUsername);
        }
        editor.apply();
    }

    public void clearAll() {
        sp.edit().clear().apply();
    }

    public boolean isRememberAccount() {
        return sp.getBoolean(K_REMEMBER_ACCOUNT, true);
    }

    public void setRememberAccount(boolean rememberAccount) {
        SharedPreferences.Editor editor = sp.edit().putBoolean(K_REMEMBER_ACCOUNT, rememberAccount);
        if (!rememberAccount) {
            editor.remove(K_REMEMBERED_USERNAME);
        }
        editor.apply();
    }

    public String getRememberedUsername() {
        return sp.getString(K_REMEMBERED_USERNAME, "");
    }

    public void saveRememberedUsername(String username) {
        sp.edit()
                .putBoolean(K_REMEMBER_ACCOUNT, true)
                .putString(K_REMEMBERED_USERNAME, username == null ? "" : username)
                .apply();
    }

    /**
     * 获取用户角色级别
     */
    public String getPermissionLevel() {
        String level = sp.getString(K_PERMISSION_LEVEL, "");
        if (level != null && !level.isEmpty()) {
            return level;
        }
        return sp.getString(K_ROLE, "");
    }

    /**
     * 获取权限列表
     */
    public java.util.List<String> getPermissions() {
        String permsStr = sp.getString(K_PERMISSIONS, "");
        if (permsStr.isEmpty()) {
            // 默认权限
            return java.util.Arrays.asList(
                "dashboard.view",
                "monitor.playback",
                "fence.view",
                "device.view",
                "personnel.view",
                "alarm.view"
            );
        }
        return java.util.Arrays.asList(permsStr.split(","));
    }

    /**
     * 保存用户角色和权限
     */
    public void saveRoleAndPermissions(String role, java.util.List<String> permissions) {
        sp.edit()
            .putString(K_ROLE, role == null ? "" : role)
            .putString(K_PERMISSION_LEVEL, role == null ? "" : role)
            .putString(K_PERMISSIONS, String.join(",", permissions))
            .apply();
    }

    /**
     * 获取用户名
     */
    public String getUsername() {
        return sp.getString(K_USERNAME, "");
    }

    /**
     * 保存用户名
     */
    public void saveUsername(String username) {
        sp.edit().putString(K_USERNAME, username == null ? "" : username).apply();
    }

    /**
     * 获取角色
     */
    public String getRole() {
        return sp.getString(K_ROLE, "");
    }

    /**
     * 检查是否有指定权限
     */
    public boolean hasPermission(String permissionCode) {
        java.util.List<String> perms = getPermissions();
        return perms.contains(permissionCode);
    }
}

