package com.app.myapplication.data.model;

import com.google.gson.annotations.SerializedName;

public class User {

    // 序列化名称与 JSON 对应字段匹配
    @SerializedName("id")
    private String id;

    @SerializedName("username")
    private String username;

    @SerializedName("dept")
    private String dept;

    @SerializedName("phone")
    private String phone;

    @SerializedName("role")
    private String role;

    @SerializedName("addedDate")
    private String addedDate;

    @SerializedName("parentId")
    private String parentId;

    // 无参构造函数
    public User() {}

    // 带参构造函数，用于初始化所有字段
    public User(String id, String username, String dept, String phone, String role, String addedDate, String parentId) {
        this.id = id;
        this.username = username;
        this.dept = dept;
        this.phone = phone;
        this.role = role;
        this.addedDate = addedDate;
        this.parentId = parentId;
    }

    // 获取器和设置器

    public String getId() {
        return id;
    }

    public void setId(String id) {
        this.id = id;
    }

    public String getUsername() {
        return username;
    }

    public void setUsername(String username) {
        this.username = username;
    }

    public String getDept() {
        return dept;
    }

    public void setDept(String dept) {
        this.dept = dept;
    }

    public String getPhone() {
        return phone;
    }

    public void setPhone(String phone) {
        this.phone = phone;
    }

    public String getRole() {
        return role;
    }

    public void setRole(String role) {
        this.role = role;
    }

    public String getAddedDate() {
        return addedDate;
    }

    public void setAddedDate(String addedDate) {
        this.addedDate = addedDate;
    }

    public String getParentId() {
        return parentId;
    }

    public void setParentId(String parentId) {
        this.parentId = parentId;
    }
}
