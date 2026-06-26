package com.app.myapplication.data.model;

/**
 * 人员 - 对应 Web 端 Person
 */
public class Person {
    
    private String id;
    private String name;
    private String employeeId;
    private String phone;
    private String workType;
    private String workTeam;
    private String project;
    private String grid;
    private String company;
    private String status; // active, inactive, on_leave, resigned
    private String entryDate;
    private String idCard;
    private String emergencyContact;
    private String role;
    private String avatar;
    
    public Person(String id, String name, String employeeId, String phone,
                  String workType, String workTeam, String project, String company,
                  String status, String entryDate) {
        this.id = id;
        this.name = name;
        this.employeeId = employeeId;
        this.phone = phone;
        this.workType = workType;
        this.workTeam = workTeam;
        this.project = project;
        this.company = company;
        this.status = status;
        this.entryDate = entryDate;
    }
    
    // Getters and Setters
    public String getId() { return id; }
    public void setId(String id) { this.id = id; }
    
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    
    public String getEmployeeId() { return employeeId; }
    public void setEmployeeId(String employeeId) { this.employeeId = employeeId; }
    
    public String getPhone() { return phone; }
    public void setPhone(String phone) { this.phone = phone; }
    
    public String getWorkType() { return workType; }
    public void setWorkType(String workType) { this.workType = workType; }
    
    public String getWorkTeam() { return workTeam; }
    public void setWorkTeam(String workTeam) { this.workTeam = workTeam; }
    
    public String getProject() { return project; }
    public void setProject(String project) { this.project = project; }

    public String getGrid() { return grid; }
    public void setGrid(String grid) { this.grid = grid; }
    
    public String getCompany() { return company; }
    public void setCompany(String company) { this.company = company; }
    
    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }
    
    public String getEntryDate() { return entryDate; }
    public void setEntryDate(String entryDate) { this.entryDate = entryDate; }
    
    public String getIdCard() { return idCard; }
    public void setIdCard(String idCard) { this.idCard = idCard; }
    
    public String getEmergencyContact() { return emergencyContact; }
    public void setEmergencyContact(String emergencyContact) { this.emergencyContact = emergencyContact; }
    
    public String getRole() { return role; }
    public void setRole(String role) { this.role = role; }
    
    public String getAvatar() { return avatar; }
    public void setAvatar(String avatar) { this.avatar = avatar; }
    
    /**
     * 获取状态显示文本
     */
    public String getStatusText() {
        switch (status) {
            case "active":
            case "employed": return "在职";
            case "inactive":
            case "resigned": return "离职";
            case "on_leave": return "休假";
            default: return "在职";
        }
    }
    
    /**
     * 获取状态颜色
     */
    public int getStatusColor() {
        switch (status) {
            case "active":
            case "employed": return 0xFF10b981; // 绿色
            case "inactive":
            case "resigned": return 0xFFef4444; // 红色
            case "on_leave": return 0xFFf59e0b; // 黄色
            default: return 0xFF10b981;
        }
    }
}
