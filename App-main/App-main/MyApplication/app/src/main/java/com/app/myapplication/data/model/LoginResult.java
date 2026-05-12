package com.app.myapplication.data.model;

/*
    后端对接字段
 */
public class LoginResult {
    // ✅ 后端对接最关键：token/refreshToken/过期时间
    public String token;
    public String refreshToken;
    public long expiresAt;   // 建议后端给过期时间戳（ms）或 expiresIn（秒）

    // ✅ 用户信息：用于“我的”页面显示/业务鉴权
    public String userId;
    public String nickname;
    public String avatarUrl;
}
