package com.app.myapplication.data.model;

import com.google.gson.annotations.SerializedName;

import java.util.List;

public class LoginResult {
    @SerializedName(value = "token", alternate = {"access_token", "accessToken"})
    public String token;

    @SerializedName(value = "refreshToken", alternate = {"refresh_token", "refresh"})
    public String refreshToken;

    @SerializedName(value = "expiresAt", alternate = {"expires_at", "expire_at", "expiresIn", "expires_in"})
    public long expiresAt;

    @SerializedName(value = "userId", alternate = {"user_id", "id"})
    public String userId;

    public String username;

    @SerializedName("full_name")
    public String fullName;

    @SerializedName(value = "nickname", alternate = {"nick_name", "name", "username"})
    public String nickname;

    @SerializedName(value = "avatarUrl", alternate = {"avatar_url", "avatar"})
    public String avatarUrl;

    public String role;
    public List<String> permissions;

    // ✅ 权限信息
    @SerializedName("permission_level")
    public String permissionLevel;
    public String company;
    public String project;
    public String team;
}
