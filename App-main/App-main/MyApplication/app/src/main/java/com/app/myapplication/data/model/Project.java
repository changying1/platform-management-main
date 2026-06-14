package com.app.myapplication.data.model;

/**
 * 项目 - 对应 Web 端 Project
 */
public class Project {
    
    private int id;
    private String name;
    private String company;
    private String team;
    private String manager;
    private String managerPhone;
    private String contact;
    private String contactPhone;
    private String startDate;
    private String endDate;
    private String status; // ongoing, completed, suspended
    private String address;
    
    public Project(int id, String name, String company, String team, 
                   String manager, String managerPhone, String contact, String contactPhone,
                   String startDate, String endDate, String status, String address) {
        this.id = id;
        this.name = name;
        this.company = company;
        this.team = team;
        this.manager = manager;
        this.managerPhone = managerPhone;
        this.contact = contact;
        this.contactPhone = contactPhone;
        this.startDate = startDate;
        this.endDate = endDate;
        this.status = status;
        this.address = address;
    }
    
    // Getters and Setters
    public int getId() { return id; }
    public void setId(int id) { this.id = id; }
    
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    
    public String getCompany() { return company; }
    public void setCompany(String company) { this.company = company; }
    
    public String getTeam() { return team; }
    public void setTeam(String team) { this.team = team; }
    
    public String getManager() { return manager; }
    public void setManager(String manager) { this.manager = manager; }
    
    public String getManagerPhone() { return managerPhone; }
    public void setManagerPhone(String managerPhone) { this.managerPhone = managerPhone; }
    
    public String getContact() { return contact; }
    public void setContact(String contact) { this.contact = contact; }
    
    public String getContactPhone() { return contactPhone; }
    public void setContactPhone(String contactPhone) { this.contactPhone = contactPhone; }
    
    public String getStartDate() { return startDate; }
    public void setStartDate(String startDate) { this.startDate = startDate; }
    
    public String getEndDate() { return endDate; }
    public void setEndDate(String endDate) { this.endDate = endDate; }
    
    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }
    
    public String getAddress() { return address; }
    public void setAddress(String address) { this.address = address; }
    
    /**
     * 获取状态显示文本
     */
    public String getStatusText() {
        switch (status) {
            case "ongoing": return "进行中";
            case "completed": return "已完成";
            case "suspended": return "已暂停";
            default: return status;
        }
    }
    
    /**
     * 获取状态颜色
     */
    public int getStatusColor() {
        switch (status) {
            case "ongoing": return 0xFF10b981; // 绿色
            case "completed": return 0xFF3b82f6; // 蓝色
            case "suspended": return 0xFFf59e0b; // 黄色
            default: return 0xFF6b7280;
        }
    }
}
