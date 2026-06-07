package com.app.myapplication.data.model.manage;

import com.google.gson.annotations.SerializedName;

public class ProjectItem {

    @SerializedName("id")
    private int id;

    @SerializedName("name")
    private String name;

    @SerializedName("code")
    private String code;

    @SerializedName("description")
    private String description;

    @SerializedName("manager")
    private String manager;

    @SerializedName("manager_name")
    private String managerName;

    @SerializedName("location")
    private String location;

    @SerializedName("status")
    private String status;

    @SerializedName("start_date")
    private String startDate;

    @SerializedName("end_date")
    private String endDate;

    @SerializedName("company")
    private String company;

    @SerializedName("branch_id")
    private int branchId;

    @SerializedName("created_at")
    private String createdAt;

    @SerializedName("updated_at")
    private String updatedAt;

    public ProjectItem() {}

    public int getId() { return id; }
    public void setId(int id) { this.id = id; }

    public String getName() { return name; }
    public void setName(String name) { this.name = name; }

    public String getCode() { return code; }
    public void setCode(String code) { this.code = code; }

    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }

    public String getManager() { return manager; }
    public void setManager(String manager) { this.manager = manager; }

    public String getManagerName() { return managerName; }
    public void setManagerName(String managerName) { this.managerName = managerName; }

    public String getLocation() { return location; }
    public void setLocation(String location) { this.location = location; }

    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }

    public String getStartDate() { return startDate; }
    public void setStartDate(String startDate) { this.startDate = startDate; }

    public String getEndDate() { return endDate; }
    public void setEndDate(String endDate) { this.endDate = endDate; }

    public String getCompany() { return company; }
    public void setCompany(String company) { this.company = company; }

    public int getBranchId() { return branchId; }
    public void setBranchId(int branchId) { this.branchId = branchId; }

    public String getCreatedAt() { return createdAt; }
    public void setCreatedAt(String createdAt) { this.createdAt = createdAt; }

    public String getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(String updatedAt) { this.updatedAt = updatedAt; }
}
