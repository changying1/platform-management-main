package com.app.myapplication.data.model;

public class UserProfile {
    public final String name;
    public final String avatarUrl; // 以后你可用 Glide 加载网络头像

    public UserProfile(String name, String avatarUrl) {
        this.name = name;
        this.avatarUrl = avatarUrl;
    }
}

