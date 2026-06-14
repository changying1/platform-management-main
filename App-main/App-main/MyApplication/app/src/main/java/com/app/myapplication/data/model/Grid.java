package com.app.myapplication.data.model;

/**
 * 网格 - 对应 Web 端 Grid
 */
public class Grid {
    
    private String gridId;
    private String name;
    private String project;
    private String company;
    private String managerId;
    private String status;
    private int personnelCount;
    private int deviceCount;
    
    public Grid(String gridId, String name, String project, String company,
                String managerId, String status, int personnelCount, int deviceCount) {
        this.gridId = gridId;
        this.name = name;
        this.project = project;
        this.company = company;
        this.managerId = managerId;
        this.status = status;
        this.personnelCount = personnelCount;
        this.deviceCount = deviceCount;
    }
    
    // Getters and Setters
    public String getGridId() { return gridId; }
    public void setGridId(String gridId) { this.gridId = gridId; }
    
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    
    public String getProject() { return project; }
    public void setProject(String project) { this.project = project; }
    
    public String getCompany() { return company; }
    public void setCompany(String company) { this.company = company; }
    
    public String getManagerId() { return managerId; }
    public void setManagerId(String managerId) { this.managerId = managerId; }
    
    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }
    
    public int getPersonnelCount() { return personnelCount; }
    public void setPersonnelCount(int personnelCount) { this.personnelCount = personnelCount; }
    
    public int getDeviceCount() { return deviceCount; }
    public void setDeviceCount(int deviceCount) { this.deviceCount = deviceCount; }
    
    public String getStatusText() {
        return "active".equals(status) ? "启用" : "禁用";
    }
}
