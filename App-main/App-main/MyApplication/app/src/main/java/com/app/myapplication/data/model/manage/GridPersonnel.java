package com.app.myapplication.data.model.manage;

import com.google.gson.annotations.SerializedName;

import java.util.List;

public class GridPersonnel {

    @SerializedName("id")
    private String id;

    @SerializedName("name")
    private String name;

    @SerializedName("role")
    private String role;

    @SerializedName("phone")
    private String phone;

    @SerializedName("department")
    private String department;

    @SerializedName("grid_ids")
    private List<String> gridIds;

    @SerializedName("created_at")
    private String createdAt;

    @SerializedName("updated_at")
    private String updatedAt;

    public GridPersonnel() {}

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }

    public String getName() { return name; }
    public void setName(String name) { this.name = name; }

    public String getRole() { return role; }
    public void setRole(String role) { this.role = role; }

    public String getPhone() { return phone; }
    public void setPhone(String phone) { this.phone = phone; }

    public String getDepartment() { return department; }
    public void setDepartment(String department) { this.department = department; }

    public List<String> getGridIds() { return gridIds; }
    public void setGridIds(List<String> gridIds) { this.gridIds = gridIds; }

    public String getCreatedAt() { return createdAt; }
    public void setCreatedAt(String createdAt) { this.createdAt = createdAt; }

    public String getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(String updatedAt) { this.updatedAt = updatedAt; }

    public String getRoleDisplayName() {
        if (role == null) return "未知";
        switch (role) {
            case "grid_manager": return "网格长";
            case "safety_manager": return "安全员";
            case "technician": return "技术员";
            case "inspector": return "巡查员";
            default: return role;
        }
    }
}
